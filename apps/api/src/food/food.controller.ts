import {
  BaseController,
  Controller,
  Get,
  HttpException,
  Inject,
  Param,
  Query,
  UseMiddleware,
} from '@onebun/core'
import { ApiOperation, ApiTags } from '@onebun/docs'
import { ClerkAuthMiddleware } from '../auth/auth.middleware'
import { FoodLookupError, FoodService } from './food.service'

@ApiTags('Food')
@Controller('/v1/foods')
@UseMiddleware(ClerkAuthMiddleware)
export class FoodController extends BaseController {
  constructor(@Inject(FoodService) private readonly foodService: FoodService) {
    super()
  }

  @ApiOperation({ summary: 'Search USDA common and branded foods' })
  @Get('/search')
  async search(@Query('q', { required: true }) query: string, @Query('page') pageValue?: string) {
    const normalizedQuery = String(query ?? '').trim()
    const page = pageValue === undefined ? 1 : Number.parseInt(pageValue, 10)
    if (normalizedQuery.length < 2 || normalizedQuery.length > 100) {
      throw new HttpException(400, 'Search query must contain between 2 and 100 characters')
    }
    if (!Number.isInteger(page) || page < 1 || page > 50) {
      throw new HttpException(400, 'Page must be between 1 and 50')
    }
    try {
      return await this.foodService.search(normalizedQuery, page)
    } catch (error) {
      if (error instanceof FoodLookupError) throw new HttpException(error.status, error.message)
      throw error
    }
  }

  @ApiOperation({ summary: 'Look up a packaged food by barcode using Open Food Facts' })
  @Get('/barcode/:barcode')
  async barcode(@Param('barcode') barcodeValue: string) {
    const barcode = String(barcodeValue ?? '').trim()
    if (!/^\d{8,14}$/.test(barcode)) {
      throw new HttpException(400, 'Barcode must contain between 8 and 14 digits')
    }
    try {
      return await this.foodService.barcode(barcode)
    } catch (error) {
      if (error instanceof FoodLookupError) throw new HttpException(error.status, error.message)
      throw error
    }
  }
}
