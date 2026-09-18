import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

const ADMIN_WA_KEY = 'admin_whatsapp_phone';
const DEFAULT_ADMIN_WA = '085155202296';

@Injectable()
export class SettingsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  async getAdminSettings() {
    return { adminWhatsAppPhone: await this.getStoredPhone() };
  }

  async updateAdminSettings(adminWhatsAppPhone: string) {
    const normalized = this.normalizeLocal(adminWhatsAppPhone);
    await this.dataSource.query(
      `INSERT INTO app_settings (setting_key, setting_value)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [ADMIN_WA_KEY, normalized],
    );
    return { adminWhatsAppPhone: normalized };
  }

  async getWhatsAppNumber(): Promise<string> {
    const local = await this.getStoredPhone();
    return this.toInternational(local);
  }

  private async getStoredPhone(): Promise<string> {
    try {
      const rows = await this.dataSource.query(
        'SELECT setting_value FROM app_settings WHERE setting_key = ? LIMIT 1',
        [ADMIN_WA_KEY],
      );
      if (rows?.[0]?.setting_value) return this.normalizeLocal(String(rows[0].setting_value));
    } catch {
      // Migration may not have been applied yet; keep checkout operational.
    }

    const env = this.config.get<string>('WA_ADMIN_PHONE')?.trim();
    return env ? this.normalizeLocal(env) : DEFAULT_ADMIN_WA;
  }

  private normalizeLocal(value: string): string {
    let digits = value.replace(/\D/g, '');
    if (digits.startsWith('62')) digits = '0' + digits.slice(2);
    if (!digits.startsWith('08')) return DEFAULT_ADMIN_WA;
    return digits;
  }

  private toInternational(value: string): string {
    const local = this.normalizeLocal(value);
    return '62' + local.slice(1);
  }
}
