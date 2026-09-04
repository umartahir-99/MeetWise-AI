import React, { useEffect, useMemo, useRef } from "react";

/**
 * GridScan - a scanning hairline grid, drawn in one WebGL pass.
 *
 * The whole effect is a single fragment shader over a fullscreen triangle:
 * grid, scan band, bloom, chromatic aberration and grain are all evaluated
 * there rather than composed from render targets, so there is no three.js and
 * no post-processing chain behind it. That keeps the hero backdrop at zero
 * added dependencies and one draw call per frame.
 *
 * The energy field that bends and brightens the grid comes either from the
 * webcam (when enableWebcam is set) or from animated value noise, so
 * sensitivity means the same thing in both modes.
 */

export interface GridScanProps {
  /** How strongly the energy field displaces and lifts the grid. 0-1. */
  sensitivity?: number;
  /** Grid line width, in device-independent pixels. */
  lineThickness?: number;
  /** Colour of the grid itself. Read as emitted light, so dark reads subtle. */
  linesColor?: string;
  /** Grid cell size, 0 (fine) to 1 (coarse). */
  gridScale?: number;
  /** Colour of the sweeping scan band. */
  scanColor?: string;
  /** Strength of the scan band. 0-1. */
  scanOpacity?: number;
  /** Enables the in-shader bloom / aberration / grain stage. */
  enablePost?: boolean;
  bloomIntensity?: number;
  chromaticAberration?: number;
  noiseIntensity?: number;
  /** Per-line positional wobble. 0 is a perfectly rigid grid. */
  lineJitter?: number;
  /** Size of the soft halo trailing the scan band. */
  scanGlow?: number;
  /** Width of the scan band's falloff. */
  scanSoftness?: number;
  /** Vertical sweeps per second. */
  scanSpeed?: number;
  enableWebcam?: boolean;
  /** Shows the raw webcam feed in the corner. Requires enableWebcam. */
  showPreview?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FRAG = `
precision highp float;

varying vec2 vUv;

uniform vec2  uRes;
uniform float uTime;
uniform float uSensitivity;
uniform float uThickness;
uniform vec3  uLinesColor;
uniform float uGridScale;
uniform vec3  uScanColor;
uniform float uScanOpacity;
uniform float uBloom;
uniform float uAberration;
uniform float uGrain;
uniform float uJitter;
uniform float uScanGlow;
uniform float uScanSoftness;
uniform float uScanSpeed;
uniform float uPost;
uniform float uUseCam;
uniform sampler2D uCam;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

/* Two octaves is enough to read as a drifting field, and keeps the eleven
   scene() evaluations below cheap. */
float fbm(vec2 p) {
  return vnoise(p) * 0.62 + vnoise(p * 2.17 + 4.3) * 0.38;
}

/* What the grid is reacting to: camera luminance, or noise standing in for it. */
float energyAt(vec2 uv, float t) {
  if (uUseCam > 0.5) {
    vec3 c = texture2D(uCam, vec2(1.0 - uv.x, 1.0 - uv.y)).rgb;
    return clamp(dot(c, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
  }
  return fbm(uv * vec2(2.6, 1.9) + vec2(t * 0.06, t * -0.04));
}

vec3 scene(vec2 uv, float t) {
  float aspect = uRes.x / max(uRes.y, 1.0);
  vec2 px = uv * uRes;

  float energy = energyAt(uv, t);

  /* Scan band. Distance wraps at the seam so the sweep re-enters from the top
     without a visible pop. */
  float scanY = fract(t * uScanSpeed);
  float d = abs(uv.y - scanY);
  d = min(d, 1.0 - d);
  float w = max(0.006 * uScanSoftness, 0.0015);
  float band = exp(-(d * d) / (w * w));
  float halo = exp(-(d * d) / (w * w * 16.0)) * uScanGlow;

  /* Cell size lives in pixels, so the grid keeps its density at any DPR. */
  float cell = mix(7.0, 150.0, clamp(uGridScale, 0.0, 1.0));

  vec2 gp = px;
  gp.x += (vnoise(vec2(uv.y * 46.0, t * 1.6)) - 0.5) * uJitter * 16.0;
  gp.y += (vnoise(vec2(uv.x * 46.0, t * 1.2 + 9.0)) - 0.5) * uJitter * 16.0;
  /* The field only really bends the grid where the scan is passing over it. */
  gp.y += (energy - 0.5) * uSensitivity * 70.0 * (0.18 + band * 0.82);

  vec2 g = gp / cell;
  vec2 f = abs(fract(g) - 0.5);
  vec2 edge = (0.5 - f) * cell;
  float th = max(uThickness, 0.35) * 0.5;
  float lx = 1.0 - smoothstep(th, th + 1.0, edge.x);
  float ly = 1.0 - smoothstep(th, th + 1.0, edge.y);
  float line = max(lx, ly);

  vec3 col = uLinesColor * line * 1.55 * (0.5 + 0.5 * energy);

  /* The scan reads as light caught on the wires: mostly on the lines, with a
     faint sheet across the cells so the band still has a body. */
  float lit = (band * (0.30 + line * 1.65) + halo * (0.08 + line * 0.55)) * uScanOpacity;
  col += uScanColor * lit * (0.55 + 0.85 * energy);

  /* Soft edges, so the layer meets the page instead of ending at it. */
  vec2 v = abs(uv - 0.5) * 2.0;
  v.x *= mix(1.0, aspect * 0.62, 0.35);
  col *= 1.0 - smoothstep(0.72, 1.06, length(v * vec2(0.86, 1.0)));

  return col;
}

void main() {
  vec2 uv = vUv;
  float t = uTime;
  vec3 col;

  if (uPost > 0.5 && uAberration > 0.0) {
    vec2 dir = (uv - 0.5) * uAberration;
    col = vec3(scene(uv + dir, t).r, scene(uv, t).g, scene(uv - dir, t).b);
  } else {
    col = scene(uv, t);
  }

  if (uPost > 0.5) {
    if (uBloom > 0.0) {
      /* Eight-tap ring rather than a separable blur - one pass, and the grid
         is thin enough that a ring is indistinguishable from the real thing. */
      vec3 bloom = vec3(0.0);
      float r = 5.0;
      for (int i = 0; i < 8; i++) {
        float a = float(i) * 0.7853981634;
        vec2 off = vec2(cos(a), sin(a)) * r / uRes;
        bloom += max(scene(uv + off, t) - 0.16, vec3(0.0));
      }
      col += bloom * 0.125 * uBloom * 3.0;
    }
    if (uGrain > 0.0) {
      col += (hash(gl_FragCoord.xy + fract(t) * 91.7) - 0.5) * uGrain;
    }
  }

  col = max(col, vec3(0.0));
  /* Premultiplied output: alpha is the light the pass emits, so the layer
     composites over the page like light rather than like a pasted rectangle. */
  float a = clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0);
  gl_FragColor = vec4(col, a);
}
`;

/** "#2F293A" -> [0.184, 0.161, 0.227]. Falls back to black on anything odd. */
function toRgb(hex: string): [number, number, number] {
  let h = hex.trim().replace("#", "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (h.length !== 6 || /[^0-9a-f]/i.test(h)) return [0, 0, 0];
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

const GridScan: React.FC<GridScanProps> = (props) => {
  const { enableWebcam = false, showPreview = false, className, style } = props;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  /* Props are read through a ref inside the frame loop, so changing a colour or
     an intensity is a uniform write - it never recompiles the program. */
  const propsRef = useRef(props);
  useEffect(() => {
    propsRef.current = props;
  });

  const wrapStyle = useMemo<React.CSSProperties>(
    () => ({ position: "absolute", inset: 0, ...style }),
    [style]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = (canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      premultipliedAlpha: true,
      powerPreference: "low-power",
    }) ||
      canvas.getContext("webgl", {
        alpha: true,
        antialias: false,
      })) as WebGLRenderingContext | null;
    if (!gl) return;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;

    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      gl.deleteProgram(prog);
      return;
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const u = (name: string) => gl.getUniformLocation(prog, name);
    const U = {
      res: u("uRes"),
      time: u("uTime"),
      sensitivity: u("uSensitivity"),
      thickness: u("uThickness"),
      linesColor: u("uLinesColor"),
      gridScale: u("uGridScale"),
      scanColor: u("uScanColor"),
      scanOpacity: u("uScanOpacity"),
      bloom: u("uBloom"),
      aberration: u("uAberration"),
      grain: u("uGrain"),
      jitter: u("uJitter"),
      scanGlow: u("uScanGlow"),
      scanSoftness: u("uScanSoftness"),
      scanSpeed: u("uScanSpeed"),
      post: u("uPost"),
      useCam: u("uUseCam"),
      cam: u("uCam"),
    };

    /* A 1x1 grey stands in whenever there is no camera frame yet, so the
       shader never samples an incomplete texture. */
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([128, 128, 128, 255])
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.uniform1i(U.cam, 0);

    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);

    let width = 0;
    let height = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (w === width && h === height) return;
      width = w;
      height = h;
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;
    let clock = 0;
    let last = performance.now();
    /* Off-screen, the loop stops entirely rather than paying for frames nobody
       sees; the observer below restarts it. */
    let visible = true;

    const frame = (now: number) => {
      raf = 0;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (!reduced.matches) clock += dt;

      const p = propsRef.current;
      const lines = toRgb(p.linesColor ?? "#2F293A");
      const scan = toRgb(p.scanColor ?? "#FF9FFC");
      const post = p.enablePost ?? false;

      const video = videoRef.current;
      const camReady =
        !!p.enableWebcam && !!video && video.readyState >= 2 && video.videoWidth > 0;
      if (camReady && video) {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      }

      gl.uniform2f(U.res, width, height);
      gl.uniform1f(U.time, clock);
      gl.uniform1f(U.sensitivity, p.sensitivity ?? 0.55);
      gl.uniform1f(U.thickness, p.lineThickness ?? 1);
      gl.uniform3f(U.linesColor, lines[0], lines[1], lines[2]);
      gl.uniform1f(U.gridScale, p.gridScale ?? 0.1);
      gl.uniform3f(U.scanColor, scan[0], scan[1], scan[2]);
      gl.uniform1f(U.scanOpacity, p.scanOpacity ?? 0.4);
      gl.uniform1f(U.bloom, post ? p.bloomIntensity ?? 0.6 : 0);
      gl.uniform1f(U.aberration, post ? p.chromaticAberration ?? 0.002 : 0);
      gl.uniform1f(U.grain, post ? p.noiseIntensity ?? 0.01 : 0);
      gl.uniform1f(U.jitter, p.lineJitter ?? 0.1);
      gl.uniform1f(U.scanGlow, p.scanGlow ?? 0.5);
      gl.uniform1f(U.scanSoftness, p.scanSoftness ?? 2);
      gl.uniform1f(U.scanSpeed, p.scanSpeed ?? 0.15);
      gl.uniform1f(U.post, post ? 1 : 0);
      gl.uniform1f(U.useCam, camReady ? 1 : 0);

      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      if (visible) raf = requestAnimationFrame(frame);
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible && raf === 0) {
          last = performance.now();
          raf = requestAnimationFrame(frame);
        }
      },
      { threshold: 0 }
    );
    io.observe(canvas);

    raf = requestAnimationFrame(frame);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      gl.deleteBuffer(buf);
      gl.deleteTexture(tex);
      gl.deleteProgram(prog);
    };
  }, []);

  /* The camera is only ever requested when the prop asks for it, and the tracks
     are stopped the moment it stops asking. */
  useEffect(() => {
    if (!enableWebcam) return;
    const video = videoRef.current;
    if (!video || !navigator.mediaDevices?.getUserMedia) return;

    let stream: MediaStream | null = null;
    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({ video: { width: 320, height: 240 }, audio: false })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        video.srcObject = s;
        return video.play();
      })
      .catch(() => {
        /* Denied or unavailable: the shader stays on its noise field. */
      });

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    };
  }, [enableWebcam]);

  return (
    <div className={className} style={wrapStyle} aria-hidden="true">
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
      <video
        ref={videoRef}
        playsInline
        muted
        style={
          enableWebcam && showPreview
            ? {
                position: "absolute",
                right: 16,
                bottom: 16,
                width: 160,
                borderRadius: 8,
                opacity: 0.85,
                transform: "scaleX(-1)",
              }
            : { position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }
        }
      />
    </div>
  );
};

export default GridScan;
