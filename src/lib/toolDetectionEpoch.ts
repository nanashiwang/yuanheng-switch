let epoch = 0;
export const toolDetectionEpoch = () => epoch;
export const invalidateToolDetection = () => {
  epoch += 1;
};
