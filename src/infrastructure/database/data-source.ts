import { DataSource } from 'typeorm';
import { validateEnv } from '../config/env.schema';
import { buildTypeOrmOptions } from './typeorm.options';

export default new DataSource(buildTypeOrmOptions(validateEnv(process.env)));
