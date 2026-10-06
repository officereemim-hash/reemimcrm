export const STAFF_LABELS = {
  bar: 'א. תיאום',
  basmat: 'בשמת',
  bot: 'בוט',
  system: 'מערכת',
};

export function staffLabel(value) {
  return STAFF_LABELS[value] || value;
}