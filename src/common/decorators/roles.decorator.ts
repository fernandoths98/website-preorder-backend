import { SetMetadata } from '@nestjs/common';
import { AdminRole } from '../enums/admin-role.enum';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: (AdminRole | 'merchant')[]) =>
  SetMetadata(ROLES_KEY, roles);
