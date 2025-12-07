/**
 * France protest source parsers
 *
 * Exports all French protest calendar parsers:
 * - Agenda Militant: Paris/Île-de-France activist events
 * - Demosphere: Regional calendars across France
 */

export { parseAgendaMilitant } from './agenda-militant.js';
export {
  parseDemosphereToulouse,
  parseDemosphereLille,
  parseDemosphereNice,
  parseDemosphereRennes,
  parseDemosphereStrasbourg,
  parseDemosphereGironde,
  parseDemosphereNantes,
  parseDemosphereLyon,
  parseDemosphereGrenoble,
  parseDemosphereMontpellier,
  getDemosphereRegions,
} from './demosphere.js';
