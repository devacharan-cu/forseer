// Single source of truth for navigation: Sidebar renders it, App routes on it.
export const NAV_ITEMS = [
  { id: 'command-center', label: 'Command Center', icon: 'grid', group: 'main' },
  { id: 'machine-intelligence', label: 'Machine Intelligence', icon: 'cpu', group: 'main' },
  { id: 'scenario-lab', label: 'Scenario Lab', icon: 'flask', group: 'main' },

  { id: 'before', label: 'Before', subtitle: 'Prevent failures', icon: 'shield', group: 'modes', accent: 'danger' },
  { id: 'during', label: 'During', subtitle: 'Monitor & contain', icon: 'activity', group: 'modes', accent: 'accent' },
  { id: 'after', label: 'After', subtitle: 'Recover & learn', icon: 'history', group: 'modes', accent: 'success' },

  { id: 'orders-production', label: 'Orders & Production', icon: 'package', group: 'ops' },
  { id: 'incidents-maintenance', label: 'Incidents & Maintenance', icon: 'wrench', group: 'ops' },
  { id: 'reports', label: 'Reports', icon: 'fileText', group: 'ops' },

  { id: 'settings', label: 'Settings', icon: 'settings', group: 'system' },
  { id: 'account', label: 'Account', icon: 'user', group: 'system', hidden: true },
]

export const NAV_GROUPS = ['main', 'modes', 'ops', 'system']

export function findNavItem(id) {
  return NAV_ITEMS.find((item) => item.id === id) ?? NAV_ITEMS[0]
}
