import { DataSource } from 'typeorm';
import { config as loadEnv } from 'dotenv';

loadEnv();

/** CLI DataSource for `typeorm migration:*`. Runtime config lives in AppModule. */
export default new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 3306),
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
});
