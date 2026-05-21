import React from 'react';
import { GLView, ExpoWebGLRenderingContext } from 'expo-gl';
import { Asset } from 'expo-asset';
import { ImageFilter } from './FilterStrip';

export interface FilterUniforms {
  brightness: number;
  contrast: number;
  saturation: number;
  tint: [number, number, number];
  tintIntensity: number;
}

export const FILTER_UNIFORMS: Record<ImageFilter, FilterUniforms> = {
  normal: { brightness: 0, contrast: 1, saturation: 1, tint: [0, 0, 0], tintIntensity: 0 },
  clarendon: { brightness: 0.02, contrast: 1.12, saturation: 1.08, tint: [0.29, 0.56, 0.85], tintIntensity: 0.08 },
  gingham: { brightness: 0, contrast: 0.92, saturation: 0.82, tint: [0.91, 0.84, 0.71], tintIntensity: 0.15 },
  moon: { brightness: 0.04, contrast: 1.05, saturation: 0, tint: [0.6, 0.6, 0.7], tintIntensity: 0.12 },
  lark: { brightness: 0.03, contrast: 0.96, saturation: 1.18, tint: [0.49, 0.78, 0.89], tintIntensity: 0.05 },
  reyes: { brightness: -0.02, contrast: 0.92, saturation: 0.88, tint: [0.83, 0.65, 0.42], tintIntensity: 0.18 },
  juno: { brightness: 0.01, contrast: 1.08, saturation: 1.22, tint: [1, 0.8, 0], tintIntensity: 0.06 },
  slumber: { brightness: -0.01, contrast: 0.95, saturation: 0.88, tint: [0.37, 0.15, 0.8], tintIntensity: 0.1 },
  crema: { brightness: 0.02, contrast: 0.9, saturation: 0.92, tint: [0.89, 0.84, 0.76], tintIntensity: 0.14 },
  ludwig: { brightness: 0.01, contrast: 1.06, saturation: 1.12, tint: [1, 0.42, 0.42], tintIntensity: 0.05 },
  aden: { brightness: 0, contrast: 0.94, saturation: 0.82, tint: [0.28, 0.86, 0.98], tintIntensity: 0.08 },
  perpetua: { brightness: 0.02, contrast: 0.98, saturation: 1.05, tint: [0.11, 0.82, 0.63], tintIntensity: 0.05 },
};

const VERTEX_SHADER = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`;

const FRAGMENT_SHADER = `
  precision highp float;
  varying vec2 v_texCoord;
  uniform sampler2D u_image;
  uniform float u_brightness;
  uniform float u_contrast;
  uniform float u_saturation;
  uniform vec3 u_tint;
  uniform float u_tintIntensity;

  void main() {
    vec4 color = texture2D(u_image, v_texCoord);

    // brightness
    color.rgb += u_brightness;

    // contrast
    color.rgb = (color.rgb - 0.5) * u_contrast + 0.5;

    // saturation
    float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    color.rgb = mix(vec3(gray), color.rgb, u_saturation);

    // tint blend
    color.rgb = mix(color.rgb, u_tint, u_tintIntensity);

    // clamp
    color.rgb = clamp(color.rgb, 0.0, 1.0);

    gl_FragColor = color;
  }
`;

function compileShader(gl: ExpoWebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('Shader compile error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl: ExpoWebGLRenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram | null {
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('Program link error:', gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

interface GLFilterViewProps {
  uri: string;
  filter: ImageFilter;
  style?: any;
}

export default function GLFilterView({ uri, filter, style }: GLFilterViewProps) {
  const uniforms = FILTER_UNIFORMS[filter];
  const glRef = React.useRef<ExpoWebGLRenderingContext | null>(null);
  const programRef = React.useRef<WebGLProgram | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const assetRef = React.useRef<Asset | null>(null);
  const locRefs = React.useRef<Record<string, WebGLUniformLocation | null>>({});

  const draw = React.useCallback(() => {
    const gl = glRef.current;
    const program = programRef.current;
    if (!gl || !program || !textureRef.current) return;

    const { brightness, contrast, saturation, tint, tintIntensity } = uniforms;

    gl.useProgram(program);
    gl.uniform1f(locRefs.current.u_brightness, brightness);
    gl.uniform1f(locRefs.current.u_contrast, contrast);
    gl.uniform1f(locRefs.current.u_saturation, saturation);
    gl.uniform3f(locRefs.current.u_tint, tint[0], tint[1], tint[2]);
    gl.uniform1f(locRefs.current.u_tintIntensity, tintIntensity);

    gl.bindTexture(gl.TEXTURE_2D, textureRef.current);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.endFrameEXP();
  }, [uniforms]);

  const onContextCreate = React.useCallback(
    async (gl: ExpoWebGLRenderingContext) => {
      glRef.current = gl;

      // Compile shaders
      const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
      const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
      if (!vs || !fs) return;

      const program = createProgram(gl, vs, fs);
      if (!program) return;
      programRef.current = program;

      // Get attribute/uniform locations
      const posLoc = gl.getAttribLocation(program, 'a_position');
      const texLoc = gl.getAttribLocation(program, 'a_texCoord');
      locRefs.current = {
        u_image: gl.getUniformLocation(program, 'u_image'),
        u_brightness: gl.getUniformLocation(program, 'u_brightness'),
        u_contrast: gl.getUniformLocation(program, 'u_contrast'),
        u_saturation: gl.getUniformLocation(program, 'u_saturation'),
        u_tint: gl.getUniformLocation(program, 'u_tint'),
        u_tintIntensity: gl.getUniformLocation(program, 'u_tintIntensity'),
      };

      // Full-screen quad (two triangles)
      const verts = new Float32Array([
        -1, -1,  0, 1,
        -1,  1,  0, 0,
         1, -1,  1, 1,
        -1,  1,  0, 0,
         1,  1,  1, 0,
         1, -1,  1, 1,
      ]);

      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(texLoc);
      gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 16, 8);

      // Set texture uniform slot
      gl.useProgram(program);
      gl.uniform1i(locRefs.current.u_image, 0);

      // Load image texture
      try {
        const asset = await Asset.fromURI(uri).downloadAsync();
        assetRef.current = asset;

        const texture = gl.createTexture();
        if (texture) {
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          // Upload image to texture
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, asset as any);
          textureRef.current = texture;
        }
      } catch (e) {
        console.warn('Failed to load image texture:', e);
      }

      draw();
    },
    [uri, draw]
  );

  // Redraw when filter changes
  React.useEffect(() => {
    if (glRef.current && programRef.current && textureRef.current) {
      draw();
    }
  }, [filter, draw]);

  return <GLView style={style} onContextCreate={onContextCreate} />;
}
