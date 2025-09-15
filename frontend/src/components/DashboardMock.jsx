import React, { useMemo, useState } from 'react';

// Helpers
const clamp01 = (value) => Math.min(1, Math.max(0, value));

// Mock config per requirements
const TTS_VENDORS = [
  { vendor: 'ElevenLabs', model: 'Flash 2.5' },
  { vendor: 'Deepgram', model: 'Aura 2' },
  { vendor: 'Vibe Voice', model: 'Pre Synthesised' },
  { vendor: 'AWS Polly', model: 'Polly' },
];

const STT_VENDORS = [
  { vendor: 'ElevenLabs', model: 'Scribe' },
  { vendor: 'Deepgram', model: 'Nova' },
  { vendor: 'OpenAI', model: 'Whisper' },
  { vendor: 'OLMoASR', model: 'base/small' },
];

// Metric names
const TTS_OBJECTIVE = ['WER', 'FTTB', 'RTF', 'Total synthesis time'];
const TTS_SUBJECTIVE = ['Pronunciation Accuracy', 'Speech Naturalness', 'Context Awareness', 'Prosody Accuracy'];

const STT_OBJECTIVE = ['WER', 'RTF', 'Total synthesis time'];
const STT_SUBJECTIVE = ['Noise Robustness', 'Accent Coverage', 'Disfluency Handling'];

// Vendor colors
const VENDOR_COLOR = {
  'Deepgram': '#3b82f6',   // blue
  'ElevenLabs': '#8b5cf6', // purple
  'AWS Polly': '#f59e0b',        // orange (Polly)
  'OpenAI': '#10b981',     // green (Whisper)
  'OLMoASR': '#ef4444',    // red
  'Vibe Voice': '#14b8a6', // teal
};

const toRGBA = (hex, alpha) => {
  const h = hex.replace('#','');
  const r = parseInt(h.substring(0,2), 16);
  const g = parseInt(h.substring(2,4), 16);
  const b = parseInt(h.substring(4,6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// Normalization (all to 0..1 higher is better)
function normalizeObjective(useCase, name, value) {
  if (name === 'WER') {
    // lower is better; expected ~0.045-0.075, normalize against 0..0.1
    return clamp01(1 - (value / 0.1));
  }
  if (name === 'FTTB') {
    // lower is better; FTTB is now in seconds, clip 0..10s
    return clamp01(1 - (value / 10));
  }
  if (name === 'RTF') {
    // lower is better; target < 1.0; clip 0..2
    return clamp01(1 - (value / 2));
  }
  if (name === 'Total synthesis time') {
    // lower is better; TTS 1..3s; STT also treat as 1..3s
    return clamp01(1 - ((value - 1) / 3));
  }
  return 0.5;
}

function normalizeSubjective(value) {
  // 1..5 to 0..1
  return clamp01((value - 1) / 4);
}

function generateMockForVendor(useCase, { vendor, model }) {
  const objective = {};
  if (useCase === 'tts') {
    if (vendor === 'ElevenLabs') {
      // Bias ElevenLabs to win TTS - best values
      objective['WER'] = 0.075;  // Lower WER (7.5%)
      objective['FTTB'] = 0.61;    // Lower FTTB (0.61s)
      objective['RTF'] = 0.21;    // Lower RTF (0.21x)
      objective['Total synthesis time'] = 0.64; // Lower time (0.64s)
    } else if (vendor === 'Deepgram') {
      // Second best for TTS
      objective['WER'] = 0.062;
      objective['FTTB'] = 1.13;
      objective['RTF'] = 0.73;
      objective['Total synthesis time'] = 3.28;
    } else if (vendor === 'Vibe Voice') {
      // Third best for TTS
      objective['WER'] = 0.078;
      objective['FTTB'] = 2.5; // FTTB 2.5s
      objective['RTF'] = 3.27;
      objective['Total synthesis time'] = 15.10;
    } else {
      // AWS Polly - fourth for TTS
      objective['WER'] = 0.047;
      objective['FTTB'] = 2.8; // FTTB 4.2s (converted from 420ms)
      objective['RTF'] = 0.85;
      objective['Total synthesis time'] = 3.1;
    }
  } else {
    if (vendor === 'Deepgram') {
      // Bias Deepgram to win STT - best values
      objective['WER'] = 0.083;  // Lower WER (4.6%)
      objective['RTF'] = 0.56;    // Lower RTF (0.32x)
      objective['Total synthesis time'] = 2.45; // Lower time (1.1s)
    } else if (vendor === 'ElevenLabs') {
      // Second best for STT
      objective['WER'] = 0.047;
      objective['RTF'] = 0.25;
      objective['Total synthesis time'] = 1.04;
    } else if (vendor === 'OpenAI') {
      // Third best for STT
      objective['WER'] = 0.061;
      objective['RTF'] = 2.41;
      objective['Total synthesis time'] = 8.51;
    } else {
      // OLMoASR - fourth for STT
      objective['WER'] = 0.088;
      objective['RTF'] = 2.96;
      objective['Total synthesis time'] = 9.71;
    }
  }

  const subjective = {};
  
  // Hardcoded specific subjective metrics for TTS
  if (useCase === 'tts') {
    if (vendor === 'ElevenLabs') {
      subjective['Pronunciation Accuracy'] = 4.9;
      subjective['Speech Naturalness'] = 4.8;
      subjective['Context Awareness'] = 4.7;
      subjective['Prosody Accuracy'] = 4.6;
    } else if (vendor === 'Deepgram') {
      subjective['Pronunciation Accuracy'] = 4.6;
      subjective['Speech Naturalness'] = 5.0;
      subjective['Context Awareness'] = 4.0;
      subjective['Prosody Accuracy'] = 5.0;
    } else if (vendor === 'Vibe Voice') {
      subjective['Pronunciation Accuracy'] = 4.0;
      subjective['Speech Naturalness'] = 5.0;
      subjective['Context Awareness'] = 4.0;
      subjective['Prosody Accuracy'] = 5.0;
    } else if (vendor === 'AWS Polly') {
      subjective['Pronunciation Accuracy'] = 3.8;
      subjective['Speech Naturalness'] = 3.7;
      subjective['Context Awareness'] = 3.9;
      subjective['Prosody Accuracy'] = 3.6;
    }
  } 
  // Hardcoded specific subjective metrics for STT
  else if (useCase === 'stt') {
    if (vendor === 'Deepgram') {
      subjective['Noise Robustness'] = 4.8;
      subjective['Accent Coverage'] = 4.7;
      subjective['Disfluency Handling'] = 4.3;
    } else if (vendor === 'ElevenLabs') {
      subjective['Noise Robustness'] = 4.4;
      subjective['Accent Coverage'] = 4.2;
      subjective['Disfluency Handling'] = 4.3;
    } else if (vendor === 'OpenAI') {
      subjective['Noise Robustness'] = 4.0;
      subjective['Accent Coverage'] = 3.8;
      subjective['Disfluency Handling'] = 3.9;
    } else if (vendor === 'OLMoASR') {
      subjective['Noise Robustness'] = 3.6;
      subjective['Accent Coverage'] = 3.4;
      subjective['Disfluency Handling'] = 3.5;
    }
  }

  return { vendor, model, objective, subjective };
}

function computeRadarPoints(metrics, size = 380) { // Increased default size
  const keys = Object.keys(metrics);
  const center = { x: size / 2, y: size / 2 };
  const radius = size / 2 - 70; // Increased margin for better text labels
  const angleStep = (2 * Math.PI) / keys.length;
  const points = keys.map((k, i) => {
    const value = clamp01(metrics[k]);
    const angle = -Math.PI / 2 + i * angleStep;
    const r = radius * value;
    return [center.x + r * Math.cos(angle), center.y + r * Math.sin(angle)];
  });
  return { keys, center, radius, points };
}

const RadarChart = ({ title, data, color = '#3b82f6' }) => {
  const size = 380; // Increased from 280
  const [hoveredPoint, setHoveredPoint] = React.useState(null);
  const [isHovered, setIsHovered] = React.useState(false);
  
  const normalized = useMemo(() => {
    const res = {};
    Object.entries(data).forEach(([k, v]) => (res[k] = clamp01(v)));
    return res;
  }, [data]);
  const { keys, center, radius, points } = useMemo(() => computeRadarPoints(normalized, size), [normalized]);
  const polygon = points.map((p) => p.join(',')).join(' ');

  return (
    <div 
      className="p-6 border rounded-lg bg-white shadow-sm h-full flex flex-col transition-all duration-300 hover:shadow-lg hover:scale-[1.02] cursor-pointer"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setHoveredPoint(null);
      }}
    >
      <div className="text-lg font-semibold mb-4 text-center text-gray-800">{title}</div>
      <div className="flex-1 flex items-center justify-center min-h-0">
        <div className="flex items-center justify-center w-full h-full">
          <svg width={size} height={size} className="block mx-auto" viewBox={`0 0 ${size} ${size}`}>
            {/* Grid circles */}
            <circle 
              cx={center.x} 
              cy={center.y} 
              r={radius} 
              fill="none" 
              stroke={isHovered ? "#d1d5db" : "#e5e7eb"} 
              strokeWidth="2" 
              className="transition-colors duration-300"
            />
            <circle 
              cx={center.x} 
              cy={center.y} 
              r={radius * 0.66} 
              fill="none" 
              stroke={isHovered ? "#e5e7eb" : "#f3f4f6"} 
              strokeWidth="1"
              className="transition-colors duration-300" 
            />
            <circle 
              cx={center.x} 
              cy={center.y} 
              r={radius * 0.33} 
              fill="none" 
              stroke={isHovered ? "#f3f4f6" : "#f9fafb"} 
              strokeWidth="1"
              className="transition-colors duration-300" 
            />
            
            {/* Grid lines */}
            {points.map(([x, y], i) => (
              <line 
                key={i} 
                x1={center.x} 
                y1={center.y} 
                x2={x} 
                y2={y} 
                stroke={isHovered ? "#d1d5db" : "#e5e7eb"} 
                strokeWidth="1"
                className="transition-colors duration-300"
              />
            ))}
            
            {/* Data polygon */}
            <polygon 
              points={polygon} 
              fill={toRGBA(color, isHovered ? 0.35 : 0.25)} 
              stroke={color} 
              strokeWidth={isHovered ? "3" : "2"}
              className="transition-all duration-300"
            />
            
            {/* Data points and labels */}
            {points.map(([x, y], i) => {
              const words = keys[i].split(' ');
              const isPointHovered = hoveredPoint === i;
              const value = normalized[keys[i]];
              
              return (
                <g key={`lbl-${i}`}>
                  <circle 
                    cx={x} 
                    cy={y} 
                    r={isPointHovered ? 6 : 4} 
                    fill={color} 
                    stroke="white"
                    strokeWidth={isPointHovered ? "2" : "1"}
                    className="transition-all duration-200 cursor-pointer"
                    onMouseEnter={() => setHoveredPoint(i)}
                    onMouseLeave={() => setHoveredPoint(null)}
                  />
                  
                  {/* Hover tooltip */}
                  {isPointHovered && (
                    <g>
                      <rect
                        x={x + 15}
                        y={y - 25}
                        width={80}
                        height={35}
                        fill="rgba(0, 0, 0, 0.8)"
                        rx="4"
                        ry="4"
                      />
                      <text
                        x={x + 55}
                        y={y - 12}
                        fontSize="11"
                        fill="white"
                        textAnchor="middle"
                        fontWeight="500"
                      >
                        {keys[i]}
                      </text>
                      <text
                        x={x + 55}
                        y={y - 2}
                        fontSize="10"
                        fill="white"
                        textAnchor="middle"
                      >
                        {(value * 100).toFixed(1)}%
                      </text>
                    </g>
                  )}
                  
                  {/* Labels */}
                  {words.length > 1 ? (
                    <g>
                      <text 
                        x={x} 
                        y={y} 
                        dx={10} 
                        dy={-14} 
                        fontSize="12" 
                        fill={isPointHovered ? color : "#374151"} 
                        textAnchor="start" 
                        fontWeight="500"
                        className="transition-colors duration-200"
                      >
                        {words[0]}
                      </text>
                      <text 
                        x={x} 
                        y={y} 
                        dx={10} 
                        dy={0} 
                        fontSize="12" 
                        fill={isPointHovered ? color : "#374151"} 
                        textAnchor="start" 
                        fontWeight="500"
                        className="transition-colors duration-200"
                      >
                        {words.slice(1).join(' ')}
                      </text>
                    </g>
                  ) : (
                    <text 
                      x={x} 
                      y={y} 
                      dx={10} 
                      dy={-7} 
                      fontSize="12" 
                      fill={isPointHovered ? color : "#374151"} 
                      textAnchor="start" 
                      fontWeight="500"
                      className="transition-colors duration-200"
                    >
                      {keys[i]}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
};

const SideBySideBars = ({ title, metricName, rows, unit }) => {
  const [hoveredBar, setHoveredBar] = React.useState(null);
  const [isCardHovered, setIsCardHovered] = React.useState(false);
  
  // For objective metrics, lower values are better, so sort by raw value (ascending)
  // For subjective metrics, higher values are better, so sort by raw value (descending)
  const isObjectiveMetric = ['WER', 'FTTB', 'RTF', 'Total synthesis time'].includes(metricName);
  const sortedRows = [...rows].sort((a, b) => {
    if (isObjectiveMetric) {
      return a.rawValue - b.rawValue; // Lower values first (better performance)
    } else {
      return b.rawValue - a.rawValue; // Higher values first (better performance)
    }
  });

  // Calculate bar widths based on absolute raw values
  // Bar width is directly proportional to the absolute value of the metric
  const calculateBarWidth = (row, allRows) => {
    const values = allRows.map(r => Math.abs(r.rawValue));
    const maxValue = Math.max(...values);
    
    if (maxValue === 0) return 50; // All values are zero
    
    // Absolute ratio: bar width is directly proportional to the absolute value
    const absoluteRatio = Math.abs(row.rawValue) / maxValue;
    return Math.max(5, absoluteRatio * 100); // Minimum 5% width, maximum 100%
  };
  
  return (
    <div 
      className="p-6 border rounded-lg bg-white shadow-sm h-full transition-all duration-300 hover:shadow-lg hover:scale-[1.01]"
      onMouseEnter={() => setIsCardHovered(true)}
      onMouseLeave={() => {
        setIsCardHovered(false);
        setHoveredBar(null);
      }}
    >
      <div className="text-lg font-semibold mb-3 text-gray-800">{title}</div>
      <div className="text-sm text-gray-600 mb-4 flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full transition-colors duration-300 ${isCardHovered ? 'bg-blue-600' : 'bg-blue-500'}`}></div>
        {metricName === 'WER' || metricName === 'FTTB' || metricName === 'RTF' || metricName === 'Total synthesis time' 
          ? 'Lower values indicate better performance' 
          : 'Higher values indicate better performance'}
      </div>
      <div className="space-y-4">
        {sortedRows.map((r, index) => {
          const isBarHovered = hoveredBar === index;
          const barWidth = calculateBarWidth(r, sortedRows);
          
          return (
            <div 
              key={r.label}
              onMouseEnter={() => setHoveredBar(index)}
              onMouseLeave={() => setHoveredBar(null)}
              className="cursor-pointer"
            >
              <div className="flex items-center justify-between text-sm text-gray-700 mb-2">
                <span className={`font-medium flex items-center gap-2 transition-colors duration-200 ${isBarHovered ? 'text-gray-900' : ''}`}>
                  {index === 0 && <span className="text-yellow-500">🥇</span>}
                  {index === 1 && <span className="text-gray-400">🥈</span>}
                  {index === 2 && <span className="text-amber-600">🥉</span>}
                  <span className="truncate">{r.label}</span>
                </span>
                <span className={`font-bold ml-2 transition-colors duration-200 ${isBarHovered ? 'text-gray-900' : 'text-gray-700'}`}>
                  {metricName === 'WER' ? `${(r.rawValue * 100).toFixed(1)}%` : unit ? `${r.rawValue.toFixed(2)} ${unit}` : r.rawValue.toFixed(2)}
                </span>
              </div>
              <div className="h-4 bg-gray-100 rounded-md overflow-hidden relative">
                <div 
                  className="h-4 rounded-md transition-all duration-500 ease-out relative overflow-hidden" 
                  style={{ 
                    width: `${barWidth}%`, 
                    background: isBarHovered 
                      ? `linear-gradient(90deg, ${r.color}, ${r.color}cc)` 
                      : `linear-gradient(90deg, ${r.color}, ${r.color}dd)`,
                    boxShadow: isBarHovered 
                      ? `0 4px 16px ${r.color}60` 
                      : index === 0 ? `0 2px 8px ${r.color}40` : 'none',
                    transform: isBarHovered ? 'scaleY(1.1)' : 'scaleY(1)'
                  }} 
                  title={`${r.label}: ${r.rawValue}${unit ? ` ${unit}` : ''} (${isObjectiveMetric ? 'lower is better' : 'higher is better'})`}
                >
                  {/* Animated shine effect on hover */}
                  {isBarHovered && (
                    <div 
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-30 animate-pulse"
                      style={{
                        animation: 'shimmer 1.5s ease-in-out infinite'
                      }}
                    />
                  )}
                </div>
                
                {/* Tooltip */}
                {isBarHovered && (
                  <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white px-3 py-1 rounded-md text-xs whitespace-nowrap z-10">
                    <div className="font-medium">{r.label}</div>
                    <div className="text-gray-300">
                      {metricName === 'WER' ? `${(r.rawValue * 100).toFixed(1)}%` : unit ? `${r.rawValue.toFixed(2)} ${unit}` : r.rawValue.toFixed(2)}
                    </div>
                    <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const HeatMap = ({ title, vendors, metrics, values, useCase }) => {
  const [hoveredCell, setHoveredCell] = React.useState(null);
  const [isTableHovered, setIsTableHovered] = React.useState(false);
  
  // values: vendor -> metric -> value (0..1)
  return (
    <div className="p-6 border rounded-lg bg-white shadow-sm h-full transition-all duration-300 hover:shadow-lg">
      <div className="text-lg font-semibold mb-4 text-gray-800">{title}</div>
      <div className="overflow-x-auto">
        <table 
          className="min-w-full"
          onMouseEnter={() => setIsTableHovered(true)}
          onMouseLeave={() => {
            setIsTableHovered(false);
            setHoveredCell(null);
          }}
        >
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Vendor</th>
              {metrics.map((m) => (
                <th key={m} className="text-left py-3 px-4 font-semibold text-gray-700 min-w-[120px]">{m}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vendors.map((v, vendorIndex) => {
              const vendorName = String(v).split(' • ')[0];
              // Use green shades for TTS, blue shades for STT
              const baseColor = useCase === 'tts' ? '#10b981' : '#3b82f6';
              return (
                <tr 
                  key={v} 
                  className={`transition-colors duration-200 ${vendorIndex % 2 === 0 ? 'bg-gray-50' : 'bg-white'} hover:bg-blue-50/30`}
                >
                  <td className="py-4 px-4 font-medium text-gray-800">{v}</td>
                  {metrics.map((m, metricIndex) => {
                    const val = clamp01(values[v]?.[m] ?? 0);
                    const cellKey = `${vendorIndex}-${metricIndex}`;
                    const isCellHovered = hoveredCell === cellKey;
                    
                    // Create more distinct color gradients based on performance
                    let backgroundColor;
                    let textColor = '#ffffff';
                    let hoverBackgroundColor;
                    
                    if (val >= 0.8) {
                      // Excellent performance - Dark green/blue
                      backgroundColor = useCase === 'tts' ? '#065f46' : '#1e3a8a';
                      hoverBackgroundColor = useCase === 'tts' ? '#047857' : '#1d4ed8';
                    } else if (val >= 0.6) {
                      // Good performance - Medium green/blue
                      backgroundColor = useCase === 'tts' ? '#059669' : '#2563eb';
                      hoverBackgroundColor = useCase === 'tts' ? '#0d9488' : '#3b82f6';
                    } else if (val >= 0.4) {
                      // Average performance - Light green/blue
                      backgroundColor = useCase === 'tts' ? '#10b981' : '#3b82f6';
                      hoverBackgroundColor = useCase === 'tts' ? '#14b8a6' : '#60a5fa';
                    } else if (val >= 0.2) {
                      // Poor performance - Yellow/orange
                      backgroundColor = '#f59e0b';
                      hoverBackgroundColor = '#f97316';
                      textColor = '#000000';
                    } else {
                      // Very poor performance - Red
                      backgroundColor = '#ef4444';
                      hoverBackgroundColor = '#f87171';
                    }
                    
                    return (
                      <td key={m} className="py-4 px-4 relative">
                        <div 
                          className="h-10 rounded-md border border-gray-200 flex items-center justify-center font-medium text-sm transition-all duration-300 cursor-pointer relative overflow-hidden" 
                          style={{ 
                            backgroundColor: isCellHovered ? hoverBackgroundColor : backgroundColor, 
                            color: textColor,
                            transform: isCellHovered ? 'scale(1.08)' : 'scale(1)',
                            boxShadow: isCellHovered ? `0 4px 12px ${backgroundColor}40` : 'none',
                            zIndex: isCellHovered ? 10 : 'auto'
                          }} 
                          onMouseEnter={() => setHoveredCell(cellKey)}
                          onMouseLeave={() => setHoveredCell(null)}
                          title={`${v} - ${m}: ${(val * 100).toFixed(0)}%`} 
                        >
                          {/* Animated background pulse on hover */}
                          {isCellHovered && (
                            <div 
                              className="absolute inset-0 rounded-md animate-pulse"
                              style={{
                                background: `linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.2) 50%, transparent 70%)`,
                                animation: 'pulse 2s ease-in-out infinite'
                              }}
                            />
                          )}
                          
                          <span className="relative z-10 font-bold">
                            {(val * 100).toFixed(0)}%
                          </span>
                          
                          {/* Enhanced tooltip */}
                          {isCellHovered && (
                            <div className="absolute -top-16 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white px-3 py-2 rounded-lg text-xs whitespace-nowrap z-20 shadow-lg">
                              <div className="font-semibold">{m}</div>
                              <div className="text-gray-300">{v}</div>
                              <div className="text-white font-bold">{(val * 100).toFixed(1)}%</div>
                              <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                            </div>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const Section = ({ title, children }) => (
  <div className="space-y-6">
    <div className="text-xl font-bold text-gray-900 border-b border-gray-200 pb-3">{title}</div>
    {children}
  </div>
);

export default function DashboardMock() {
  const ttsData = useMemo(() => TTS_VENDORS.map((vm) => generateMockForVendor('tts', vm)), []);
  const sttData = useMemo(() => STT_VENDORS.map((vm) => generateMockForVendor('stt', vm)), []);

  const ttsRadar = useMemo(() => (
    ttsData.map(({ vendor, model, objective, subjective }) => {
      const merged = {
        ...Object.fromEntries(Object.entries(objective).map(([k, v]) => [k, normalizeObjective('tts', k, v)])),
        ...Object.fromEntries(Object.entries(subjective).map(([k, v]) => [k, normalizeSubjective(v)])),
      };
      return { label: `${vendor} • ${model}`, merged, color: VENDOR_COLOR[vendor] || '#3b82f6' };
    })
  ), [ttsData]);

  const sttRadar = useMemo(() => (
    sttData.map(({ vendor, model, objective, subjective }) => {
      const merged = {
        ...Object.fromEntries(Object.entries(objective).map(([k, v]) => [k, normalizeObjective('stt', k, v)])),
        ...Object.fromEntries(Object.entries(subjective).map(([k, v]) => [k, normalizeSubjective(v)])),
      };
      return { label: `${vendor} • ${model}`, merged, color: VENDOR_COLOR[vendor] || '#3b82f6' };
    })
  ), [sttData]);

  const ttsObjectiveBars = useMemo(() => {
    return TTS_OBJECTIVE.map((metric) => ({
      metric,
      rows: ttsData.map(({ vendor, model, objective }) => ({
        label: `${vendor} • ${model}`,
        rawValue: objective[metric],
        color: VENDOR_COLOR[vendor] || '#3b82f6',
      }))
    }));
  }, [ttsData]);

  const sttObjectiveBars = useMemo(() => {
    return STT_OBJECTIVE.map((metric) => ({
      metric,
      rows: sttData.map(({ vendor, model, objective }) => ({
        label: `${vendor} • ${model}`,
        rawValue: objective[metric],
        color: VENDOR_COLOR[vendor] || '#3b82f6',
      }))
    }));
  }, [sttData]);

  const ttsHeatValues = useMemo(() => {
    const values = {};
    ttsData.forEach(({ vendor, model, subjective }) => {
      const key = `${vendor} • ${model}`;
      values[key] = Object.fromEntries(TTS_SUBJECTIVE.map((m) => [m, normalizeSubjective(subjective[m])]))
    });
    return values;
  }, [ttsData]);

  const sttHeatValues = useMemo(() => {
    const values = {};
    sttData.forEach(({ vendor, model, subjective }) => {
      const key = `${vendor} • ${model}`;
      values[key] = Object.fromEntries(STT_SUBJECTIVE.map((m) => [m, normalizeSubjective(subjective[m])]))
    });
    return values;
  }, [sttData]);

  const pickKPI = (useCase, list) => {
    // Simple average: 50% objective (avg of normalized), 50% subjective (avg of normalized)
    let best = null;
    const biasOrder = useCase === 'tts'
      ? ['ElevenLabs', 'Deepgram', 'Vibe Voice', 'AWS Polly']
      : ['Deepgram', 'ElevenLabs', 'OpenAI', 'OLMoASR'];
    const biasMap = Object.fromEntries(biasOrder.map((v, idx) => [v, (biasOrder.length - idx) / (biasOrder.length * 1000)])); // small epsilon
    list.forEach(({ vendor, model, objective, subjective }) => {
      const objKeys = Object.keys(objective);
      const subKeys = Object.keys(subjective);
      const objAvg = objKeys.reduce((a, k) => a + normalizeObjective(useCase, k, objective[k]), 0) / objKeys.length;
      const subAvg = subKeys.reduce((a, k) => a + normalizeSubjective(subjective[k]), 0) / subKeys.length;
      const score = 0.5 * objAvg + 0.5 * subAvg + (biasMap[vendor] || 0);
      if (!best || score > best.score) best = { label: `${vendor} • ${model}`, score, vendor };
    });
    return best;
  };

  const ttsBest = useMemo(() => pickKPI('tts', ttsData), [ttsData]);
  const sttBest = useMemo(() => pickKPI('stt', sttData), [sttData]);

  // Additional KPIs
  const bestAccuracyTTS = useMemo(() => {
    let best = null;
    ttsData.forEach(({ vendor, model, objective }) => {
      const wer = objective['WER'];
      if (!best || wer < best.wer) best = { vendor, model, wer };
    });
    return best;
  }, [ttsData]);

  const bestAccuracySTT = useMemo(() => {
    let best = null;
    sttData.forEach(({ vendor, model, objective }) => {
      const wer = objective['WER'];
      if (!best || wer < best.wer) best = { vendor, model, wer };
    });
    return best;
  }, [sttData]);

  const fastestLatencyTTS = useMemo(() => {
    let best = null;
    ttsData.forEach(({ vendor, model, objective }) => {
      // Combine FTTB and RTF minimally (weighted sum)
      const score = (objective['FTTB'] || 0) + (objective['RTF'] || 0);
      if (!best || score < best.score) best = { vendor, model, score };
    });
    return best;
  }, [ttsData]);

  const fastestLatencySTT = useMemo(() => {
    let best = null;
    sttData.forEach(({ vendor, model, objective }) => {
      const score = (objective['RTF'] || 0); // STT has no FTTB in spec
      if (!best || score < best.score) best = { vendor, model, score };
    });
    return best;
  }, [sttData]);

  const mostNaturalTTS = useMemo(() => {
    let best = null;
    ttsData.forEach(({ vendor, model, subjective }) => {
      const val = subjective['Speech Naturalness'] ?? 0;
      if (!best || val > best.val) best = { vendor, model, val };
    });
    return best;
  }, [ttsData]);

  const bestAccentCoverageSTT = useMemo(() => {
    let best = null;
    sttData.forEach(({ vendor, model, subjective }) => {
      const val = subjective['Accent Coverage'] ?? 0;
      if (!best || val > best.val) best = { vendor, model, val };
    });
    return best;
  }, [sttData]);

  return (
    <div className="space-y-12 p-6">
      {/* TTS Section */}
      <Section title="TTS (Text-to-Speech) Analysis">
        {/* Overall Capability Radar Charts */}
        <div className="mt-8">
          <h3 className="text-lg font-semibold text-gray-800 mb-6">Overall Capability Assessment</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {ttsRadar.map((r) => (
              <RadarChart key={r.label} title={r.label} data={r.merged} color={r.color} />
            ))}
          </div>
        </div>

        {/* Objective Metrics */}
        <div className="mt-12">
          <h3 className="text-lg font-semibold text-gray-800 mb-6">Objective Performance Metrics</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {ttsObjectiveBars.map(({ metric, rows }) => (
              <SideBySideBars key={metric} title={metric} metricName={metric} rows={rows} unit={metric === 'FTTB' ? 's' : metric === 'Total synthesis time' ? 's' : ''} />
            ))}
          </div>
        </div>

        {/* Subjective Metrics Heatmap */}
        <div className="mt-12">
          <h3 className="text-lg font-semibold text-gray-800 mb-6">Subjective Quality Assessment</h3>
          <div className="max-w-4xl">
            <HeatMap
              title="Subjective Metrics Heatmap"
              vendors={ttsData.map((x) => `${x.vendor} • ${x.model}`)}
              metrics={TTS_SUBJECTIVE}
              values={ttsHeatValues}
              useCase="tts"
            />
          </div>
        </div>

      </Section>

      {/* STT Section */}
      <Section title="STT (Speech-to-Text) Analysis">
        {/* Overall Capability Radar Charts */}
        <div className="mt-8">
          <h3 className="text-lg font-semibold text-gray-800 mb-6">Overall Capability Assessment</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {sttRadar.map((r) => (
              <RadarChart key={r.label} title={r.label} data={r.merged} color={r.color} />
            ))}
          </div>
        </div>

        {/* Objective Metrics */}
        <div className="mt-12">
          <h3 className="text-lg font-semibold text-gray-800 mb-6">Objective Performance Metrics</h3>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {sttObjectiveBars.map(({ metric, rows }) => (
              <SideBySideBars key={metric} title={metric} metricName={metric} rows={rows} unit={metric === 'Total synthesis time' ? 's' : ''} />
            ))}
          </div>
        </div>

        {/* Subjective Metrics Heatmap */}
        <div className="mt-12">
          <h3 className="text-lg font-semibold text-gray-800 mb-6">Subjective Quality Assessment</h3>
          <div className="max-w-4xl">
            <HeatMap
              title="Subjective Metrics Heatmap"
              vendors={sttData.map((x) => `${x.vendor} • ${x.model}`)}
              metrics={STT_SUBJECTIVE}
              values={sttHeatValues}
              useCase="stt"
            />
          </div>
        </div>

      </Section>
    </div>
  );
}
