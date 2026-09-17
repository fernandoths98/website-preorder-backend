import { Controller, Get, Param } from '@nestjs/common';
import { BatchesService } from './batches.service';
import { Public } from '../../common/decorators/public.decorator';

@Public()
@Controller('batches')
export class BatchesController {
  constructor(private readonly batchesService: BatchesService) {}

  @Get('current')
  current() {
    return this.batchesService.current();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.batchesService.findOne(id);
  }
}
