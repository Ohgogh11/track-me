import { Module } from '@onebun/core'
import { ClerkAuthMiddleware } from './auth/auth.middleware'
import { FoodController } from './food/food.controller'
import { FoodService } from './food/food.service'
import { HealthController } from './health.controller'
import { SyncController } from './sync/sync.controller'
import { SyncService } from './sync/sync.service'

@Module({
  controllers: [HealthController, SyncController, FoodController],
  providers: [SyncService, FoodService, ClerkAuthMiddleware],
})
export class AppModule {}
