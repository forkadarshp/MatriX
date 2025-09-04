import React, { useMemo } from 'react';

// Helpers
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const rand = (min, max) => min + Math.random() * (max - min);

// Mock config per requirements
const TTS_VENDORS = [
  { vendor: 'ElevenLabs', model: 'Flash 2.5' },
  { vendor: 'Deepgram', model: 'Aura 2' },
  { vendor: 'Vibe Voice', model: 'Pre Synthesised' },
  { vendor: 'AWS', model: 'Polly' },
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
  'AWS': '#f59e0b',        // orange (Polly)
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
    // lower is better; expected ~0.05-0.07, normalize against 0..0.1
    return clamp01(1 - (value / 0.1));
  }
  if (name === 'FTTB') {
    // lower is better; baseline 0.8s, clip 0..2s
    return clamp01(1 - (value / 2));
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
      // Bias ElevenLabs to win TTS
      objective['WER'] = rand(0.045, 0.055);  // Lower WER
      objective['FTTB'] = rand(0.6, 0.7);     // Lower FTTB
      objective['RTF'] = rand(0.2, 0.4);      // Lower RTF
      objective['Total synthesis time'] = rand(1.0, 1.5); // Lower time
    } else {
      objective['WER'] = rand(0.055, 0.075);
      objective['FTTB'] = rand(0.7, 0.9);
      objective['RTF'] = rand(0.4, 0.9);
      objective['Total synthesis time'] = rand(1.5, 3.0);
    }
  } else {
    if (vendor === 'Deepgram') {
      // Bias Deepgram to win STT
      objective['WER'] = rand(0.045, 0.055);  // Lower WER
      objective['RTF'] = rand(0.3, 0.5);      // Lower RTF
      objective['Total synthesis time'] = rand(1.0, 1.5); // Lower time
    } else {
      objective['WER'] = rand(0.055, 0.075);
      objective['RTF'] = rand(0.5, 0.9);
      objective['Total synthesis time'] = rand(1.5, 3.0);
    }
  }

  const subjective = {};
  const subjList = useCase === 'tts' ? TTS_SUBJECTIVE : STT_SUBJECTIVE;
  subjList.forEach((k) => {
    if (useCase === 'tts' && vendor === 'ElevenLabs') {
      // Bias ElevenLabs TTS subjective
      subjective[k] = rand(4.2, 5.0);
    } else if (useCase === 'stt' && vendor === 'Deepgram') {
      // Bias Deepgram STT subjective
      subjective[k] = rand(4.2, 5.0);
    } else {
      subjective[k] = rand(3.0, 4.5);
    }
  });

  return { vendor, model, objective, subjective };
}

function computeRadarPoints(metrics, size = 280) {
  const keys = Object.keys(metrics);
  const center = { x: size / 2, y: size / 2 };
  const radius = size / 2 - 25;
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
  const size = 300;
  const normalized = useMemo(() => {
    const res = {};
    Object.entries(data).forEach(([k, v]) => (res[k] = clamp01(v)));
    return res;
  }, [data]);
  const { keys, center, radius, points } = useMemo(() => computeRadarPoints(normalized, size), [normalized]);
  const polygon = points.map((p) => p.join(',')).join(' ');

  return (
    <div className="p-3 border rounded bg-white">
      <div className="text-sm font-medium mb-2">{title}</div>
      <svg width={size} height={size} className="mx-auto block">
        <circle cx={center.x} cy={center.y} r={radius} fill="none" stroke="#e5e7eb" />
        <circle cx={center.x} cy={center.y} r={radius * 0.66} fill="none" stroke="#f3f4f6" />
        <circle cx={center.x} cy={center.y} r={radius * 0.33} fill="none" stroke="#f9fafb" />
        {points.map(([x, y], i) => (
          <line key={i} x1={center.x} y1={center.y} x2={x} y2={y} stroke="#e5e7eb" />
        ))}
        <polygon points={polygon} fill={toRGBA(color, 0.2)} stroke={color} />
        {points.map(([x, y], i) => (
          <g key={`lbl-${i}`}>
            <circle cx={x} cy={y} r={3} fill={color} />
            <text x={x} y={y} dx={12} dy={-12} fontSize="12" fill="#374151">{keys[i]}</text>
          </g>
        ))}
      </svg>
    </div>
  );
};

const SideBySideBars = ({ title, metricName, rows, unit }) => {
  // rows: [{ label, rawValue, normValue, color }]
  return (
    <div className="p-3 border rounded bg-white">
      <div className="text-sm font-medium mb-2">{title}</div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex items-center justify-between text-xs text-gray-600">
              <span className="font-medium">{r.label}</span>
              <span>{metricName === 'WER' ? `${(r.rawValue * 100).toFixed(1)}%` : unit ? `${r.rawValue.toFixed(2)} ${unit}` : r.rawValue.toFixed(2)}</span>
            </div>
            <div className="h-2 bg-gray-100 rounded">
              <div className="h-2 rounded" style={{ width: `${Math.round(r.normValue * 100)}%`, background: r.color }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const HeatMap = ({ title, vendors, metrics, values, useCase }) => {
  // values: vendor -> metric -> value (0..1)
  return (
    <div className="p-3 border rounded bg-white">
      <div className="text-sm font-medium mb-2">{title}</div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className="text-left p-2">Vendor</th>
              {metrics.map((m) => (
                <th key={m} className="text-left p-2">{m}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vendors.map((v) => {
              const vendorName = String(v).split(' • ')[0];
              // Use green shades for TTS, blue shades for STT
              const baseColor = useCase === 'tts' ? '#10b981' : '#3b82f6';
              return (
                <tr key={v}>
                  <td className="p-2 font-medium text-gray-700">{v}</td>
                  {metrics.map((m) => {
                    const val = clamp01(values[v]?.[m] ?? 0);
                    const color = toRGBA(baseColor, 0.2 + 0.6 * val);
                    return (
                      <td key={m} className="p-2">
                        <div className="h-6 rounded" style={{ background: color }} title={`${(val * 100).toFixed(0)}%`} />
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
  <div className="space-y-3">
    <div className="text-base font-semibold text-gray-800">{title}</div>
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
        normValue: normalizeObjective('tts', metric, objective[metric]),
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
        normValue: normalizeObjective('stt', metric, objective[metric]),
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
      ? ['ElevenLabs', 'Deepgram', 'Vibe Voice', 'AWS']
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
    <div className="space-y-8">
      {/* TTS Section */}
      <Section title="TTS (Text-to-Speech) Analysis">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Section title="Overall Capability (Radar)">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {ttsRadar.map((r) => (
                <RadarChart key={r.label} title={r.label} data={r.merged} color={r.color} />
              ))}
            </div>
          </Section>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Section title="Objective Metrics (Side-by-Side)">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {ttsObjectiveBars.map(({ metric, rows }) => (
                <SideBySideBars key={metric} title={metric} metricName={metric} rows={rows} unit={metric === 'FTTB' ? 's' : metric === 'Total synthesis time' ? 's' : ''} />
              ))}
            </div>
          </Section>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Section title="Subjective Metrics (Heatmap)">
            <HeatMap
              title="TTS Vendors vs Subjective Metrics"
              vendors={ttsData.map((x) => `${x.vendor} • ${x.model}`)}
              metrics={TTS_SUBJECTIVE}
              values={ttsHeatValues}
              useCase="tts"
            />
          </Section>
        </div>

        <div className="grid grid-cols-1 gap-6">
          <div className="p-4 border rounded bg-white space-y-2">
            <div className="text-base font-semibold mb-1">TTS • KPI</div>
            <div className="text-sm">🏆 <span className="font-medium">Best Accuracy</span>: {bestAccuracyTTS ? `${bestAccuracyTTS.vendor} • ${bestAccuracyTTS.model} (${(bestAccuracyTTS.wer*100).toFixed(1)}% WER)` : '—'}</div>
            <div className="text-sm">⚡ <span className="font-medium">Fastest Latency</span>: {fastestLatencyTTS ? `${fastestLatencyTTS.vendor} • ${fastestLatencyTTS.model}` : '—'}</div>
            <div className="text-sm">🎙 <span className="font-medium">Most Natural Voice</span>: {mostNaturalTTS ? `${mostNaturalTTS.vendor} • ${mostNaturalTTS.model}` : '—'}</div>
            <div className="text-sm text-gray-700">Final Pick: <span className="font-semibold">{ttsBest?.label}</span></div>
          </div>
        </div>
      </Section>

      {/* STT Section */}
      <Section title="STT (Speech-to-Text) Analysis">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Section title="Overall Capability (Radar)">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {sttRadar.map((r) => (
                <RadarChart key={r.label} title={r.label} data={r.merged} color={r.color} />
              ))}
            </div>
          </Section>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Section title="Objective Metrics (Side-by-Side)">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {sttObjectiveBars.map(({ metric, rows }) => (
                <SideBySideBars key={metric} title={metric} metricName={metric} rows={rows} unit={metric === 'Total synthesis time' ? 's' : ''} />
              ))}
            </div>
          </Section>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Section title="Subjective Metrics (Heatmap)">
            <HeatMap
              title="STT Vendors vs Subjective Metrics"
              vendors={sttData.map((x) => `${x.vendor} • ${x.model}`)}
              metrics={STT_SUBJECTIVE}
              values={sttHeatValues}
              useCase="stt"
            />
          </Section>
        </div>

        <div className="grid grid-cols-1 gap-6">
          <div className="p-4 border rounded bg-white space-y-2">
            <div className="text-base font-semibold mb-1">STT • KPI</div>
            <div className="text-sm">🏆 <span className="font-medium">Best Accuracy</span>: {bestAccuracySTT ? `${bestAccuracySTT.vendor} • ${bestAccuracySTT.model} (${(bestAccuracySTT.wer*100).toFixed(1)}% WER)` : '—'}</div>
            <div className="text-sm">⚡ <span className="font-medium">Fastest Latency</span>: {fastestLatencySTT ? `${fastestLatencySTT.vendor} • ${fastestLatencySTT.model}` : '—'}</div>
            <div className="text-sm">🎙 <span className="font-medium">Best Accent Coverage</span>: {bestAccentCoverageSTT ? `${bestAccentCoverageSTT.vendor} • ${bestAccentCoverageSTT.model}` : '—'}</div>
            <div className="text-sm text-gray-700">Final Pick: <span className="font-semibold">{sttBest?.label}</span></div>
          </div>
        </div>
      </Section>
    </div>
  );
}
