import { Test, TestingModule } from '@nestjs/testing';
import { CredencialService } from './credencial.service';

describe('CredencialService', () => {
  let service: CredencialService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CredencialService],
    }).compile();

    service = module.get<CredencialService>(CredencialService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
