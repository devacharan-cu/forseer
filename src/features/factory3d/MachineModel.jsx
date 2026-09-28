import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { useMemo } from 'react'
import { MathUtils } from 'three'

// Loads a machine GLB and drives its stack light. Each instance gets its own
// andon materials so every machine can show its own state.
export default function MachineModel({ url, lit, ...handlers }) {
  const { scene } = useGLTF(url)
  const { object, andon } = useMemo(() => {
    const clone = scene.clone(true)
    const lights = {}
    clone.traverse((node) => {
      if (!node.isMesh) return
      if (node.material.name?.startsWith('andon_')) {
        node.material = node.material.clone()
        lights[node.material.name.replace('andon_', '')] = node.material
      }
    })
    return { object: clone, andon: lights }
  }, [scene])

  useFrame(({ clock }) => {
    for (const [name, mat] of Object.entries(andon)) {
      if (name !== lit) {
        mat.emissiveIntensity = MathUtils.lerp(mat.emissiveIntensity, 0.02, 0.2)
        mat.opacity = 0.55
        continue
      }
      mat.opacity = 0.95
      // A critical/failed machine's red light blinks, as a real stack light would.
      mat.emissiveIntensity = name === 'red' ? 2.4 + Math.sin(clock.elapsedTime * 5) * 1.6 : 2.2
    }
  })

  return <primitive object={object} {...handlers} />
}
