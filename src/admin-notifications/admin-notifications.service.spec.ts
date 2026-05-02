import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AdminNotificationsService } from './admin-notifications.service';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';

const mockRedis = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
const mockPrisma = { $queryRaw: jest.fn() };
const mockPush = { sendPushToUser: jest.fn() };

describe('AdminNotificationsService', () => {
  let service: AdminNotificationsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminNotificationsService,
        { provide: RedisService, useValue: mockRedis },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PushNotificationsService, useValue: mockPush },
      ],
    }).compile();
    service = module.get<AdminNotificationsService>(AdminNotificationsService);
  });

  describe('getPermission', () => {
    it('devuelve superadmin para DNI 34824092', async () => {
      const result = await service.getPermission('34824092');
      expect(result).toEqual({ role: 'superadmin' });
    });

    it('devuelve superadmin para DNI 21677083', async () => {
      const result = await service.getPermission('21677083');
      expect(result).toEqual({ role: 'superadmin' });
    });

    it('devuelve sender si Redis tiene admin:perm:{dni}', async () => {
      mockRedis.get.mockResolvedValue('1');
      const result = await service.getPermission('99999999');
      expect(mockRedis.get).toHaveBeenCalledWith('admin:perm:99999999');
      expect(result).toEqual({ role: 'sender' });
    });

    it('devuelve null si no tiene permiso', async () => {
      mockRedis.get.mockResolvedValue(null);
      const result = await service.getPermission('00000000');
      expect(result).toEqual({ role: null });
    });
  });

  describe('addPermission', () => {
    it('agrega permiso si el caller es superadmin', async () => {
      await service.addPermission('12345678', '34824092');
      expect(mockRedis.set).toHaveBeenCalledWith('admin:perm:12345678', '1');
    });

    it('lanza ForbiddenException si el caller no es superadmin', async () => {
      mockRedis.get.mockResolvedValue(null);
      await expect(service.addPermission('12345678', '99999999')).rejects.toThrow(ForbiddenException);
    });
  });
});
