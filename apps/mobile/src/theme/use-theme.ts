import { type AppColors, darkColors } from './colors'

export function useAppTheme(): { colors: AppColors; dark: boolean } {
  return { colors: darkColors, dark: true }
}
