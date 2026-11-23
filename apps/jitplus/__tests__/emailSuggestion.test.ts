import { suggestEmail } from '@/utils/emailSuggestion';

describe('suggestEmail', () => {
  it('fixes common domain typos', () => {
    expect(suggestEmail('ali@gmial.com')).toBe('ali@gmail.com');
    expect(suggestEmail('Ali@Gmail.co')).toBe('ali@gmail.com');
    expect(suggestEmail('sara@hotmal.fr')).toBe('sara@hotmail.fr');
    expect(suggestEmail('x@yahooo.fr')).toBe('x@yahoo.fr');
  });

  it('leaves known and unrelated domains alone', () => {
    expect(suggestEmail('ali@gmail.com')).toBeNull();
    expect(suggestEmail('ali@monentreprise.ma')).toBeNull();
    expect(suggestEmail('not-an-email')).toBeNull();
  });
});
