import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { UpdateSettingsDto } from './dto/update-settings.dto';

const KEYS = {
  adminWhatsAppPhone: 'admin_whatsapp_phone',
  storefrontShipFromLabel: 'storefront_ship_from_label',
  storefrontFreeDeliveryText: 'storefront_free_delivery_text',
  storefrontDeliveryNote: 'storefront_delivery_note',
} as const;

const DEFAULTS = {
  adminWhatsAppPhone: '085155202296',
  storefrontShipFromLabel: '',
  storefrontFreeDeliveryText: 'Gratis ongkir hingga radius 5 km',
  storefrontDeliveryNote: 'Untuk pesanan sekitar area layanan. Di luar radius 5 km, ongkir menyesuaikan.'
} as const;

@Injectable()
export class SettingsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  async getAdminSettings() {
    const storefront = await this.getStorefrontSettings();
    return {
      adminWhatsAppPhone: await this.getStoredPhone(),
      ...storefront,
    };
  }

  async updateAdminSettings(dto: UpdateSettingsDto) {
    const updates: Array<[string, string]> = [];

    if (dto.adminWhatsAppPhone !== undefined) {
      updates.push([KEYS.adminWhatsAppPhone, this.normalizeLocal(dto.adminWhatsAppPhone)]);
    }
    if (dto.storefrontShipFromLabel !== undefined) {
      updates.push([KEYS.storefrontShipFromLabel, dto.storefrontShipFromLabel.trim()]);
    }
    if (dto.storefrontFreeDeliveryText !== undefined) {
      updates.push([KEYS.storefrontFreeDeliveryText, dto.storefrontFreeDeliveryText.trim()]);
    }
    if (dto.storefrontDeliveryNote !== undefined) {
      updates.push([KEYS.storefrontDeliveryNote, dto.storefrontDeliveryNote.trim()]);
    }

    for (const [key, value] of updates) {
      await this.dataSource.query(
        `INSERT INTO app_settings (setting_key, setting_value)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [key, value],
      );
    }

    return this.getAdminSettings();
  }

  async getStorefrontSettings() {
    const rows = await this.getSettings([
      KEYS.storefrontShipFromLabel,
      KEYS.storefrontFreeDeliveryText,
      KEYS.storefrontDeliveryNote,
    ]);

    return {
      storefrontShipFromLabel:
        rows.get(KEYS.storefrontShipFromLabel) ?? DEFAULTS.storefrontShipFromLabel,
      storefrontFreeDeliveryText:
        rows.get(KEYS.storefrontFreeDeliveryText) ?? DEFAULTS.storefrontFreeDeliveryText,
      storefrontDeliveryNote:
        rows.get(KEYS.storefrontDeliveryNote) ?? DEFAULTS.storefrontDeliveryNote,
    };
  }

  async getWhatsAppNumber(): Promise<string> {
    const local = await this.getStoredPhone();
    return this.toInternational(local);
  }

  private async getStoredPhone(): Promise<string> {
    try {
      const rows = await this.getSettings([KEYS.adminWhatsAppPhone]);
      const value = rows.get(KEYS.adminWhatsAppPhone);
      if (value) return this.normalizeLocal(value);
    } catch {
      // app_settings migration may not exist during an old deployment.
    }

    const env = this.config.get<string>('WA_ADMIN_PHONE')?.trim();
    return env ? this.normalizeLocal(env) : DEFAULTS.adminWhatsAppPhone;
  }

  private async getSettings(keys: string[]): Promise<Map<string, string>> {
    try {
      if (!keys.length) return new Map();
      const placeholders = keys.map(() => '?').join(',');
      const rows = await this.dataSource.query(
        `SELECT setting_key, setting_value
         FROM app_settings
         WHERE setting_key IN (${placeholders})`,
        keys,
      );
      return new Map(
        (rows as Array<{ setting_key: string; setting_value: string }>).map((row) => [
          row.setting_key,
          row.setting_value,
        ]),
      );
    } catch {
      return new Map();
    }
  }

  private normalizeLocal(value: string): string {
    let digits = value.replace(/\D/g, '');
    if (digits.startsWith('62')) digits = '0' + digits.slice(2);
    if (!digits.startsWith('08')) return DEFAULTS.adminWhatsAppPhone;
    return digits;
  }

  private toInternational(value: string): string {
    const local = this.normalizeLocal(value);
    return '62' + local.slice(1);
  }
}
