export const weapons = {
  手枪: ['classic', 'shorty', 'frenzy', 'ghost', 'bandit', 'sheriff'],
  步枪: ['bulldog', 'guardian', 'phantom', 'vandal', 'warden'],
  霰弹枪: ['bucky', 'judge'],
  冲锋枪: ['stinger', 'spectre'],
  狙击枪: ['marshal', 'outlaw', 'operator'],
  重机枪: ['ares', 'odin'],
};

export const weaponName = (id: string) => id[0].toUpperCase() + id.slice(1);
export const isWeapon = (id: string) => Object.values(weapons).some(group => group.includes(id));
