import { fitWithin } from './photo-resize';

describe('fitWithin', () => {
  it('scales a landscape image down to the max edge', () => {
    expect(fitWithin(3000, 2000, 1600)).toEqual({ width: 1600, height: 1067 });
  });

  it('never upscales a smaller image', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it('scales a portrait image by its height', () => {
    expect(fitWithin(1000, 4000, 1600)).toEqual({ width: 400, height: 1600 });
  });

  it('never rounds an extreme aspect ratio down to 0 px', () => {
    expect(fitWithin(1, 4000, 1600).width).toBeGreaterThanOrEqual(1);
  });
});
