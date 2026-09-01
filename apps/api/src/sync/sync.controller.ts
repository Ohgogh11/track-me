import {
  BaseController,
  Body,
  Controller,
  HttpException,
  Inject,
  type OneBunRequest,
  Post,
  Req,
  UseMiddleware,
} from '@onebun/core'
import { ApiOperation, ApiTags } from '@onebun/docs'
import { ContractValidationError, validateSyncRequest } from '@track-me/contracts'
import { ClerkAuthMiddleware } from '../auth/auth.middleware'
import { getRequestAuth } from '../auth/auth-context'
import { SyncService } from './sync.service'

@ApiTags('Synchronization')
@Controller('/v1')
@UseMiddleware(ClerkAuthMiddleware)
export class SyncController extends BaseController {
  constructor(@Inject(SyncService) private readonly syncService: SyncService) {
    super()
  }

  @ApiOperation({
    summary: 'Push local mutations and pull remote changes',
    description: 'A null cursor performs the initial bootstrap. Mutation IDs are idempotent.',
  })
  @Post('/sync')
  async sync(@Req() request: OneBunRequest, @Body() body: unknown) {
    try {
      const syncRequest = validateSyncRequest(body)
      return await this.syncService.synchronize(getRequestAuth(request).userId, syncRequest)
    } catch (error) {
      if (error instanceof ContractValidationError) throw new HttpException(400, error.message)
      throw error
    }
  }
}
