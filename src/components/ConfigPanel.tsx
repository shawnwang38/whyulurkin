import styles from './ConfigPanel.module.css'

export interface ConfigValues {
  headPoseYawDeg: number
  headPosePitchDeg: number
}

interface ConfigPanelProps {
  config: ConfigValues
  onChange: (updated: ConfigValues) => void
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
}) {
  return (
    <div className={styles.sliderRow}>
      <div className={styles.sliderLabel}>
        <span>{label}</span>
        <span className={styles.sliderValue}>{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className={styles.slider}
      />
    </div>
  )
}

export function ConfigPanel({ config, onChange }: ConfigPanelProps) {
  const set = (key: keyof ConfigValues) => (v: number) =>
    onChange({ ...config, [key]: v })

  return (
    <div className={styles.panel}>
      <p className={styles.panelTitle}>sensitivity</p>
      <Slider
        label="yaw threshold"
        value={config.headPoseYawDeg}
        min={5}
        max={45}
        step={1}
        format={v => `±${v}°`}
        onChange={set('headPoseYawDeg')}
      />
      <Slider
        label="pitch threshold"
        value={config.headPosePitchDeg}
        min={5}
        max={35}
        step={1}
        format={v => `±${v}°`}
        onChange={set('headPosePitchDeg')}
      />
    </div>
  )
}
