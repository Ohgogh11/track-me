import { BaseController, Controller, Get } from '@onebun/core'
import { ApiOperation, ApiTags } from '@onebun/docs'

@ApiTags('System')
@Controller()
export class HealthController extends BaseController {
  @ApiOperation({ summary: 'API health check' })
  @Get('/health')
  health() {
    return {
      status: 'healthy',
      service: 'track-me-api',
      timestamp: new Date().toISOString(),
    }
  }
}
