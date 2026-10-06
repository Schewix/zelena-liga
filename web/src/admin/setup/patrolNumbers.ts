/** Compresses sorted numbers into ranges, e.g. [1,2,3,5,7,8] -> "1–3, 5, 7–8". */
export function formatNumberRanges(numbers: number[]): string {
  const ranges: string[] = [];
  let index = 0;
  while (index < numbers.length) {
    let end = index;
    while (end + 1 < numbers.length && numbers[end + 1] === numbers[end] + 1) {
      end += 1;
    }
    ranges.push(end > index ? `${numbers[index]}–${numbers[end]}` : `${numbers[index]}`);
    index = end + 1;
  }
  return ranges.join(', ');
}
