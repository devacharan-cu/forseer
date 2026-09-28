import { Canvas, useFrame } from '@react-three/fiber'
import { CameraControls, ContactShadows, Environment, Grid, Html, Line, useGLTF } from '@react-three/drei'
import { forwardRef, Suspense, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import { andonFor, riskTone, STATE_LABEL } from '../factory/model.js'
import MachineModel from './MachineModel.jsx'
import { CONVEYOR_MODEL_URL, ENVIRONMENT_HDRI, MACHINE_MODELS, PROP_MODELS } from './modelRegistry.js'

const TONE_COLORS = {
  danger: '#ef4444',
  warning: '#f59e0b',
  success: '#22c55e',
  info: '#3b82f6',
  neutral: '#9ca3af',
}

const THEME = {
  dark: { background: '#000000', floor: '#0c0d0f', lane: '#141619', grid: '#1f2328', gridSection: '#2a2f36', fog: [22, 70], env: 0.55, shadow: 0.75 },
  light: { background: '#eef0f3', floor: '#e3e6ea', lane: '#d9dde2', grid: '#cfd4da', gridSection: '#bcc3cb', fog: [30, 90], env: 0.95, shadow: 0.45 },
}

Object.values(MACHINE_MODELS).forEach((model) => useGLTF.preload(model.url))
Object.values(PROP_MODELS).forEach((model) => useGLTF.preload(model.url))
useGLTF.preload(CONVEYOR_MODEL_URL)

function StatusRing({ extents, color, emphasis, selected }) {
  const ref = useRef()
  const [x0, x1] = extents.x
  const [z0, z1] = extents.z
  const pad = 0.35
  const points = useMemo(
    () => [
      [x0 - pad, 0.02, z0 - pad],
      [x1 + pad, 0.02, z0 - pad],
      [x1 + pad, 0.02, z1 + pad],
      [x0 - pad, 0.02, z1 + pad],
      [x0 - pad, 0.02, z0 - pad],
    ],
    [x0, x1, z0, z1],
  )
  useFrame(({ clock }) => {
    if (!ref.current || !emphasis) return
    ref.current.material.opacity = 0.18 + (Math.sin(clock.elapsedTime * 3) + 1) * 0.14
  })
  return (
    <group>
      <Line points={points} color={selected ? '#3b82f6' : color} lineWidth={selected ? 3 : emphasis ? 2.2 : 1.2} transparent opacity={selected || emphasis ? 1 : 0.7} />
      {emphasis || selected ? (
        <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[(x0 + x1) / 2, 0.012, (z0 + z1) / 2]}>
          <planeGeometry args={[x1 - x0 + pad * 2, z1 - z0 + pad * 2]} />
          <meshBasicMaterial color={selected ? '#3b82f6' : color} transparent opacity={0.16} depthWrite={false} />
        </mesh>
      ) : null}
    </group>
  )
}

function MachineInstance({ placement, info, selected, isHero, showLabel, onSelect, onOpen, onHover }) {
  const model = MACHINE_MODELS[placement.modelKey]
  const lit = andonFor(info.engineState, info.riskLevel)
  const tone = info.engineState === 'failed' ? 'danger' : riskTone(info.riskLevel)

  const localExtents = { x: model.x, z: model.z }
  const handleClick = (event) => {
    event.stopPropagation()
    onSelect(info.id)
  }

  return (
    <group position={placement.position}>
      <MachineModel
        url={placement.url}
        lit={lit}
        onClick={handleClick}
        onDoubleClick={(event) => {
          event.stopPropagation()
          onOpen(info.id)
        }}
        onPointerOver={(event) => {
          event.stopPropagation()
          onHover(info.id)
        }}
        onPointerOut={() => onHover(null)}
      />
      <StatusRing extents={localExtents} color={TONE_COLORS[tone]} emphasis={isHero} selected={selected} />
      {showLabel ? (
        <Html position={[0, placement.height + 0.55, 0]} center distanceFactor={16} zIndexRange={[20, 0]}>
          <button
            type="button"
            className={['fs-machine-label', `fs-machine-label--${tone}`, selected ? 'fs-machine-label--selected' : '', isHero ? 'fs-machine-label--hero' : ''].filter(Boolean).join(' ')}
            onClick={() => onSelect(info.id)}
            onDoubleClick={() => onOpen(info.id)}
          >
            <span className="fs-machine-label__dot" />
            <span className="fs-machine-label__code">{info.code}</span>
            <span className="fs-machine-label__status">
              {info.engineState === 'failed' ? 'Failed' : info.riskLevel !== 'LOW' ? info.riskLevel : STATE_LABEL[info.engineState]}
            </span>
          </button>
        </Html>
      ) : null}
    </group>
  )
}

function Conveyor({ conveyor }) {
  const { scene } = useGLTF(CONVEYOR_MODEL_URL)
  const object = useMemo(() => scene.clone(true), [scene])
  const x = (conveyor.from[0] + conveyor.to[0]) / 2
  return <primitive object={object} position={[x, 0, conveyor.from[2]]} scale={[conveyor.length, 1, 1]} />
}

function Prop({ prop }) {
  const model = PROP_MODELS[prop.kind]
  const { scene } = useGLTF(model.url)
  const object = useMemo(() => scene.clone(true), [scene])
  return <primitive object={object} position={prop.position} rotation={[0, prop.rotationY ?? 0, 0]} scale={model.scale} />
}

function Floor({ layout, palette }) {
  const { bounds } = layout
  const cx = (bounds.minX + bounds.maxX) / 2
  const cz = (bounds.minZ + bounds.maxZ) / 2
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.01, cz]} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color={palette.floor} roughness={0.9} metalness={0.05} />
      </mesh>
      <Grid
        position={[cx, 0.001, cz]}
        args={[200, 200]}
        cellSize={1}
        cellThickness={0.6}
        cellColor={palette.grid}
        sectionSize={5}
        sectionThickness={1}
        sectionColor={palette.gridSection}
        fadeDistance={70}
        fadeStrength={1.5}
        infiniteGrid
      />
      {layout.rows.map((row) => {
        const start = bounds.minX - 5
        const end = row.xEnd + 1.5
        const width = end - start
        const depth = 5.2
        const mid = (start + end) / 2
        const edge = (dz) => [
          [start, 0.015, row.z + dz],
          [end, 0.015, row.z + dz],
        ]
        return (
          <group key={row.id}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[mid, 0.004, row.z]}>
              <planeGeometry args={[width, depth]} />
              <meshStandardMaterial color={palette.lane} roughness={0.85} metalness={0.05} />
            </mesh>
            <Line points={edge(-depth / 2)} color="#e0a800" lineWidth={2} />
            <Line points={edge(depth / 2)} color="#e0a800" lineWidth={2} />
            <Html position={[bounds.minX - 3.4, 0.05, row.z]} center zIndexRange={[10, 0]}>
              <div className="fs-line-label">
                <span className="fs-line-label__code">{row.code}</span>
                <span className="fs-line-label__name">{row.name.replace(/^Line \d+\s*—\s*/, '')}</span>
              </div>
            </Html>
          </group>
        )
      })}
    </group>
  )
}

function Scene({ layout, machineInfo, selectedId, heroId, showLabels, showProps, onSelect, onOpen, onHover, palette }) {
  const span = Math.max(layout.bounds.maxX - layout.bounds.minX, layout.bounds.maxZ - layout.bounds.minZ)
  const cx = (layout.bounds.minX + layout.bounds.maxX) / 2
  const cz = (layout.bounds.minZ + layout.bounds.maxZ) / 2
  return (
    <>
      <Floor layout={layout} palette={palette} />
      {layout.machines.map((placement) => (
        <MachineInstance
          key={placement.id}
          placement={placement}
          info={machineInfo.get(placement.id)}
          selected={selectedId === placement.id}
          isHero={heroId === placement.id}
          showLabel={showLabels}
          onSelect={onSelect}
          onOpen={onOpen}
          onHover={onHover}
        />
      ))}
      {layout.conveyors.map((conveyor) => (
        <Conveyor key={conveyor.id} conveyor={conveyor} />
      ))}
      {showProps ? layout.props.map((prop, index) => <Prop key={`${prop.kind}-${index}`} prop={prop} />) : null}
      <ContactShadows
        position={[cx, 0.005, cz]}
        scale={span + 16}
        resolution={1024}
        blur={2.6}
        far={6}
        opacity={palette.shadow}
        frames={1}
      />
    </>
  )
}

function defaultView(layout) {
  const { bounds } = layout
  const cx = (bounds.minX + bounds.maxX) / 2
  const cz = (bounds.minZ + bounds.maxZ) / 2
  const span = Math.max(bounds.maxX - bounds.minX, (bounds.maxZ - bounds.minZ) * 1.6)
  return { eye: [cx + span * 0.12, span * 0.62, cz + span * 0.78], target: [cx, 0.8, cz + 1] }
}

// Imperative camera commands (reset / focus) for the toolbar outside the canvas.
const CameraRig = forwardRef(function CameraRig({ layout, selectedId, focusOnSelect }, ref) {
  const controls = useRef()
  const view = useMemo(() => defaultView(layout), [layout])

  const focus = useCallback(
    (id) => {
      const placement = layout.machines.find((m) => m.id === id)
      if (!placement || !controls.current) return
      const [x, , z] = placement.position
      const h = placement.height
      controls.current.setLookAt(x + 4.2, h + 3.8, z + 8.5, x, h * 0.42, z, true)
    },
    [layout],
  )

  useImperativeHandle(ref, () => ({
    reset: () => controls.current?.setLookAt(...view.eye, ...view.target, true),
    focus,
  }))

  useEffect(() => {
    controls.current?.setLookAt(...view.eye, ...view.target, false)
  }, [view])

  useEffect(() => {
    if (selectedId && focusOnSelect) focus(selectedId)
  }, [selectedId, focusOnSelect, focus])

  return (
    <CameraControls
      ref={controls}
      makeDefault
      minDistance={3.5}
      maxDistance={90}
      maxPolarAngle={Math.PI / 2 - 0.08}
      smoothTime={0.35}
      dollyToCursor
    />
  )
})

const FactoryCanvas = forwardRef(function FactoryCanvas(
  { layout, machineInfo, selectedId, heroId, theme, showLabels = true, showProps = true, focusOnSelect = true, onSelect, onOpen, onHover },
  ref,
) {
  const palette = THEME[theme] ?? THEME.light
  return (
    <Canvas
      className="fs-factory-canvas"
      dpr={[1, 1.75]}
      camera={{ fov: 38, near: 0.1, far: 400, position: [0, 30, 40] }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
    >
      <color attach="background" args={[palette.background]} />
      <fog attach="fog" args={[palette.background, ...palette.fog]} />
      <ambientLight intensity={theme === 'dark' ? 0.18 : 0.35} />
      <directionalLight position={[12, 20, 14]} intensity={theme === 'dark' ? 1.1 : 1.5} />
      <directionalLight position={[-14, 10, -8]} intensity={0.35} color="#dbe7ff" />
      <Suspense fallback={null}>
        <Environment files={ENVIRONMENT_HDRI} environmentIntensity={palette.env} />
        <Scene
          layout={layout}
          machineInfo={machineInfo}
          selectedId={selectedId}
          heroId={heroId}
          showLabels={showLabels}
          showProps={showProps}
          onSelect={onSelect}
          onOpen={onOpen}
          onHover={onHover}
          palette={palette}
        />
      </Suspense>
      <CameraRig ref={ref} layout={layout} selectedId={selectedId} focusOnSelect={focusOnSelect} />
    </Canvas>
  )
})

export default FactoryCanvas
