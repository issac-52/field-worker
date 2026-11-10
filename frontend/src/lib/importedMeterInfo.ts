/** Display mapping for legacy/raw H values in demo data and Excel exports. */
export function importedMeterInfo(raw?: string, remark?: string) {
  const value = raw?.trim() ?? '';
  return {
    meterPresenceRaw: value === '완료' ? '완료' : '',
    importRemark: value === '완료' ? '' : value || remark || '',
  };
}
