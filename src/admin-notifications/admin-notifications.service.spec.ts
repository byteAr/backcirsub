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

  describe('sendNotification', () => {
    it('guarda el mensaje en Redis y devuelve ok: true', async () => {
      mockRedis.get
        .mockResolvedValueOnce(null)   // get messagesKey → vacío
        .mockResolvedValueOnce(null);  // get unreadKey → 0
      mockRedis.set.mockResolvedValue('OK');
      mockPush.sendPushToUser.mockResolvedValue({ ok: true, message: 'Notificación enviada' });

      const result = await service.sendNotification(
        { targetUserId: 10, titulo: 'Hola', cuerpo: 'Cuerpo' },
        '34824092',
      );

      expect(result.ok).toBe(true);
      // Verifica que se guardó el mensaje
      const [messagesCallArgs] = mockRedis.set.mock.calls.find(
        ([k]) => k === 'admin:msgs:10',
      )!;
      expect(messagesCallArgs).toBe('admin:msgs:10');
    });

    it('lanza ForbiddenException si el caller no tiene permiso', async () => {
      mockRedis.get.mockResolvedValue(null);
      await expect(
        service.sendNotification(
          { targetUserId: 10, titulo: 'Hola', cuerpo: 'Cuerpo' },
          '00000000',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('devuelve pushed: false si no hay suscripción push', async () => {
      // Caller es superadmin, no hace falta Redis para perm
      mockRedis.get
        .mockResolvedValueOnce(null)  // messagesKey
        .mockResolvedValueOnce(null); // unreadKey
      mockRedis.set.mockResolvedValue('OK');
      mockPush.sendPushToUser.mockResolvedValue({ ok: false, message: 'Sin subscription' });

      const result = await service.sendNotification(
        { targetUserId: 5, titulo: 'Test', cuerpo: 'Test body' },
        '34824092',
      );
      expect(result).toEqual({ ok: true, pushed: false });
    });
  });

  describe('getMessages', () => {
    it('retorna mensajes en orden inverso (más recientes primero) y el contador unread', async () => {
      const msgs = [
        { id: '1', titulo: 'Primero', cuerpo: 'body1', fecha: '2026-01-01T00:00:00.000Z' },
        { id: '2', titulo: 'Segundo', cuerpo: 'body2', fecha: '2026-01-02T00:00:00.000Z' },
      ];
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify(msgs))
        .mockResolvedValueOnce('2');

      const result = await service.getMessages(10);
      expect(result.unread).toBe(2);
      expect(result.messages[0].titulo).toBe('Segundo'); // más reciente primero
    });

    it('retorna arrays vacíos y unread 0 si no hay datos en Redis', async () => {
      mockRedis.get.mockResolvedValue(null);
      const result = await service.getMessages(99);
      expect(result).toEqual({ messages: [], unread: 0 });
    });
  });

  describe('markRead', () => {
    it('resetea el contador de unread a 0', async () => {
      mockRedis.set.mockResolvedValue('OK');
      const result = await service.markRead(10);
      expect(mockRedis.set).toHaveBeenCalledWith('admin:unread:10', '0');
      expect(result).toEqual({ ok: true });
    });
  });
});
