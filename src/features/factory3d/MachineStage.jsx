import { Canvas } from '@react-three/fiber'
import { ContactShadows, Environment, OrbitControls, useProgress } from '@react-three/drei'
import { Suspense } from 'react'
import ErrorBoundary from '../../components/ui/ErrorBoundary.jsx'
import Icon from '../../components/ui/Icon.jsx'
import { useTheme } from '../../context/ThemeContext.jsx'
import MachineModel from './MachineModel.jsx'
import { ENVIRONMENT_HDRI, MACHINE_MODELS, modelKeyForType } from './modelRegistry.js'
import './FactoryView.css'

function Loading() {
  const { active, progress } = useProgress()
  if (!active) return null
  return <div className="fs-factory__loading">Loading model… {Math.round(progress)}%</div>
}

// A single machine on a turntable, lit the same way as the factory floor.
export default function MachineStage({ machineType, lit, height = 340 }) {
  const { theme } = useTheme()
  const model = MACHINE_MODELS[modelKeyForType(machineType)]
  const cx = (model.x[0] + model.x[1]) / 2
  const cz = (model.z[0] + model.z[1]) / 2
  const span = Math.max(model.x[1] - model.x[0], model.height, model.z[1] - model.z[0])
  const background = theme === 'dark' ? '#000000' : '#eef0f3'

  return (
    <div className="fs-factory fs-stage" style={{ height }}>
      <ErrorBoundary
        fallback={(error) => (
          <div className="fs-factory__error">
            <Icon name="alertTriangle" size={20} />
            <p>3D preview unavailable ({error.message}).</p>
          </div>
        )}
      >
        <Canvas className="fs-factory-canvas" dpr={[1, 1.75]} camera={{ fov: 32, position: [cx + span * 1.1, model.height * 1.05, cz + span * 1.55] }}>
          <color attach="background" args={[background]} />
          <ambientLight intensity={theme === 'dark' ? 0.2 : 0.4} />
          <directionalLight position={[5, 8, 6]} intensity={1.4} />
          <Suspense fallback={null}>
            <Environment files={ENVIRONMENT_HDRI} environmentIntensity={theme === 'dark' ? 0.6 : 0.95} />
            <group position={[-cx, 0, -cz]}>
              <MachineModel url={model.url} lit={lit} />
            </group>
            <ContactShadows position={[0, 0.002, 0]} scale={span * 2.4} blur={2.4} far={4} opacity={theme === 'dark' ? 0.8 : 0.5} frames={1} />
          </Suspense>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]}>
            <circleGeometry args={[span * 1.1, 64]} />
            <meshStandardMaterial color={theme === 'dark' ? '#101113' : '#e2e5e9'} roughness={0.9} />
          </mesh>
          <OrbitControls
            makeDefault
            target={[0, model.height * 0.42, 0]}
            autoRotate
            autoRotateSpeed={0.6}
            enablePan={false}
            minDistance={span * 0.9}
            maxDistance={span * 3}
            maxPolarAngle={Math.PI / 2 - 0.05}
          />
        </Canvas>
      </ErrorBoundary>
      <Loading />
      <div className="fs-factory__hint">Drag to rotate · scroll to zoom</div>
    </div>
  )
}
