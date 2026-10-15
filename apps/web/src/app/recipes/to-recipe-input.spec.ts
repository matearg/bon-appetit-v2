import { toRecipeInput } from './to-recipe-input';

describe('toRecipeInput', () => {
  it('trims every string and drops blank ingredient and step lines', () => {
    expect(
      toRecipeInput({ title: ' Soup ', ingredients: ['a', ' ', '  b '], steps: ['', 'x'] }),
    ).toEqual({ title: 'Soup', ingredients: ['a', 'b'], steps: ['x'] });
  });
});
