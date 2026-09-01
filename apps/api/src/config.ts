import { Env } from '@onebun/core'

export const envSchema = {
  server: {
    port: Env.number({ default: 3000, env: 'PORT' }),
    host: Env.string({ default: '0.0.0.0', env: 'HOST' }),
  },
  app: {
    environment: Env.string({ default: 'development', env: 'NODE_ENV' }),
  },
  food: {
    usdaApiKey: Env.string({ default: '', env: 'USDA_FDC_API_KEY' }),
    openFoodFactsUserAgent: Env.string({
      default: 'TrackMe/0.1 (personal fitness tracker)',
      env: 'OPEN_FOOD_FACTS_USER_AGENT',
    }),
  },
}
