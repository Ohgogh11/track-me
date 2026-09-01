import { OneBunApplication } from '@onebun/core'
import { AppModule } from './app.module'
import { envSchema } from './config'

const port = Number.parseInt(process.env.PORT ?? '3000', 10)
const host = process.env.HOST ?? '0.0.0.0'

const application = new OneBunApplication(AppModule, {
  port,
  host,
  development: (process.env.NODE_ENV ?? 'development') !== 'production',
  envSchema,
  envOptions: { loadDotEnv: true },
  docs: {
    enabled: true,
    path: '/docs',
    jsonPath: '/openapi.json',
    title: 'Track Me API',
    version: '0.1.0',
    description: 'Offline-first synchronization API for the Track Me mobile app.',
  },
})

await application.start()
application.getLogger({ className: 'Bootstrap' }).info(`Track Me API listening on http://${host}:${port}`)
