import { Test, TestingModule } from '@nestjs/testing';
import { CredencialController } from './credencial.controller';
import { CredencialService } from './credencial.service';

describe('CredencialController', () => {
  let controller: CredencialController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CredencialController],
      providers: [CredencialService],
    }).compile();

    controller = module.get<CredencialController>(CredencialController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
