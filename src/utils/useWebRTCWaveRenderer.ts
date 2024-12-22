import { useEffect, useRef } from 'react';

const dataMap = new WeakMap();

/**
 * Normalizes a Float32Array to Array(m): We use this to draw amplitudes on a graph
 */
const normalizeArray = (
  data: Float32Array,
  m: number,
  downsamplePeaks: boolean = false,
  memoize: boolean = false
) => {
  let cache, mKey, dKey;
  if (memoize) {
    mKey = m.toString();
    dKey = downsamplePeaks.toString();
    cache = dataMap.has(data) ? dataMap.get(data) : {};
    dataMap.set(data, cache);
    cache[mKey] = cache[mKey] || {};
    if (cache[mKey][dKey]) {
      return cache[mKey][dKey];
    }
  }
  const n = data.length;
  const result = new Array(m);
  if (m <= n) {
    // Downsampling
    result.fill(0);
    const count = new Array(m).fill(0);
    for (let i = 0; i < n; i++) {
      const index = Math.floor(i * (m / n));
      if (downsamplePeaks) {
        // take highest result in the set
        result[index] = Math.max(result[index], Math.abs(data[i]));
      } else {
        result[index] += Math.abs(data[i]);
      }
      count[index]++;
    }
    if (!downsamplePeaks) {
      for (let i = 0; i < result.length; i++) {
        result[i] = result[i] / count[i];
      }
    }
  } else {
    for (let i = 0; i < m; i++) {
      const index = (i * (n - 1)) / (m - 1);
      const low = Math.floor(index);
      const high = Math.ceil(index);
      const t = index - low;
      if (high >= n) {
        result[i] = data[n - 1];
      } else {
        result[i] = data[low] * (1 - t) + data[high] * t;
      }
    }
  }
  if (memoize) {
    cache[mKey as string][dKey as string] = result;
  }
  return result;
};

// Normalize frequency data to a 0-1 range with smoother transitions
const normalizeFrequencyData = (data: Float32Array): Float32Array => {
  const normalized = new Float32Array(data.length);
  const minDb = -100;
  const maxDb = -30;
  
  for (let i = 0; i < data.length; i++) {
    // Convert from dB to linear scale with smooth clamping
    let db = Math.max(minDb, Math.min(maxDb, data[i]));
    normalized[i] = Math.pow((db - minDb) / (maxDb - minDb), 2); // Square for better visual response
  }
  return normalized;
};

export const WavRenderer = {
  /**
   * Renders a point-in-time snapshot of an audio sample with smooth animations
   */
  drawBars: (
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    data: Float32Array,
    color: string,
    pointCount: number = 0,
    barWidth: number = 0,
    barSpacing: number = 0,
    center: boolean = false,
    prevHeights?: Float32Array
  ): Float32Array => {
    pointCount = Math.floor(
      Math.min(
        pointCount,
        (canvas.width - barSpacing) / (Math.max(barWidth, 1) + barSpacing)
      )
    );
    if (!pointCount) {
      pointCount = Math.floor(
        (canvas.width - barSpacing) / (Math.max(barWidth, 1) + barSpacing)
      );
    }
    if (!barWidth) {
      barWidth = (canvas.width - barSpacing) / pointCount - barSpacing;
    }

    // Use time domain data for more responsive visualization
    const normalizedData = normalizeFrequencyData(data);
    
    // Average nearby frequencies for each bar
    const currentHeights = new Float32Array(pointCount);
    const samplesPerBar = Math.floor(normalizedData.length / pointCount);
    
    for (let i = 0; i < pointCount; i++) {
      let sum = 0;
      const startIdx = i * samplesPerBar;
      const endIdx = Math.min(startIdx + samplesPerBar, normalizedData.length);
      
      for (let j = startIdx; j < endIdx; j++) {
        sum += normalizedData[j];
      }
      
      const average = sum / (endIdx - startIdx);
      const targetHeight = Math.max(0.02, average); // Minimum height for visual interest
      const prevHeight = prevHeights ? prevHeights[i] : targetHeight;
      
      // Smooth transition between previous and target height
      const easing = 0.3; // Lower = smoother animation
      currentHeights[i] = prevHeight + (targetHeight - prevHeight) * easing;
      
      const height = currentHeights[i] * canvas.height;
      const x = barSpacing + i * (barWidth + barSpacing);
      const y = center ? (canvas.height - height) / 2 : canvas.height - height;

      // Gradient color based on amplitude
      const gradient = ctx.createLinearGradient(x, y, x, y + height);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, color + '80'); // Add transparency at the bottom
      
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, barWidth, height);
    }

    return currentHeights;
  },
};

interface AudioAnalyzer {
  analyser: AnalyserNode;
  dataArray: Float32Array;
  prevHeights?: Float32Array;
}

export function useWebRTCWaveRenderer() {
  const localCanvasRef = useRef<HTMLCanvasElement>(null);
  const remoteCanvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext>();
  const localAnalyzerRef = useRef<AudioAnalyzer>();
  const remoteAnalyzerRef = useRef<AudioAnalyzer>();

  const setupAnalyzer = (stream: MediaStream): AudioAnalyzer => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }

    const audioContext = audioContextRef.current;
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    
    // Adjust analyzer settings for smoother visualization
    analyser.fftSize = 256; // Smaller FFT size for better performance
    analyser.smoothingTimeConstant = 0.7; // Less smoothing for more responsiveness
    analyser.minDecibels = -90;
    analyser.maxDecibels = -10;
    
    source.connect(analyser);

    const dataArray = new Float32Array(analyser.frequencyBinCount);
    return { analyser, dataArray };
  };

  const connectLocalStream = (stream: MediaStream) => {
    localAnalyzerRef.current = setupAnalyzer(stream);
  };

  const connectRemoteStream = (stream: MediaStream) => {
    remoteAnalyzerRef.current = setupAnalyzer(stream);
  };

  useEffect(() => {
    let isLoaded = true;
    let animationFrame: number;

    const localCanvas = localCanvasRef.current;
    let localCtx: CanvasRenderingContext2D | null = null;

    const remoteCanvas = remoteCanvasRef.current;
    let remoteCtx: CanvasRenderingContext2D | null = null;

    const render = () => {
      if (isLoaded) {
        if (localCanvas && localAnalyzerRef.current) {
          if (!localCanvas.width || !localCanvas.height) {
            localCanvas.width = localCanvas.offsetWidth;
            localCanvas.height = localCanvas.offsetHeight;
          }
          localCtx = localCtx || localCanvas.getContext('2d');
          if (localCtx) {
            localCtx.clearRect(0, 0, localCanvas.width, localCanvas.height);
            const analyzer = localAnalyzerRef.current.analyser;
            analyzer.getFloatFrequencyData(localAnalyzerRef.current.dataArray);
            localAnalyzerRef.current.prevHeights = WavRenderer.drawBars(
              localCanvas,
              localCtx,
              localAnalyzerRef.current.dataArray,
              '#0099ff',
              10,
              0,
              8,
              false,
              localAnalyzerRef.current.prevHeights
            );
          }
        }

        if (remoteCanvas && remoteAnalyzerRef.current) {
          if (!remoteCanvas.width || !remoteCanvas.height) {
            remoteCanvas.width = remoteCanvas.offsetWidth;
            remoteCanvas.height = remoteCanvas.offsetHeight;
          }
          remoteCtx = remoteCtx || remoteCanvas.getContext('2d');
          if (remoteCtx) {
            remoteCtx.clearRect(0, 0, remoteCanvas.width, remoteCanvas.height);
            const analyzer = remoteAnalyzerRef.current.analyser;
            analyzer.getFloatFrequencyData(remoteAnalyzerRef.current.dataArray);
            remoteAnalyzerRef.current.prevHeights = WavRenderer.drawBars(
              remoteCanvas,
              remoteCtx,
              remoteAnalyzerRef.current.dataArray,
              '#009900',
              10,
              0,
              8,
              false,
              remoteAnalyzerRef.current.prevHeights
            );
          }
        }
        animationFrame = window.requestAnimationFrame(render);
      }
    };
    render();

    return () => {
      isLoaded = false;
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }
      // Clean up audio context and analyzers
      if (audioContextRef.current?.state !== 'closed') {
        audioContextRef.current?.close();
      }
    };
  }, []);

  return {
    localCanvasRef,
    remoteCanvasRef,
    connectLocalStream,
    connectRemoteStream,
  };
}
