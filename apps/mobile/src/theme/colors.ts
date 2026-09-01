export interface AppColors {
  background: string
  surface: string
  surfaceRaised: string
  text: string
  textMuted: string
  border: string
  primary: string
  primaryText: string
  success: string
  warning: string
  danger: string
  overlay: string
}

export const darkColors: AppColors = {
  background: '#050806',
  surface: '#0D140F',
  surfaceRaised: '#142019',
  text: '#F5FFF8',
  textMuted: '#9AB5A3',
  border: '#24402D',
  primary: '#32E875',
  primaryText: '#031107',
  success: '#32E875',
  warning: '#FBBF24',
  danger: '#FF5C5C',
  overlay: 'rgba(0, 0, 0, 0.78)',
}

// Track Me intentionally uses one high-contrast black/green palette in all modes.
export const lightColors: AppColors = darkColors
