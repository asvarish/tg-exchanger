/**
 * Форматирует число, разделяя тысячи неразрывными пробелами (nbsp)
 * @param value - число или строка с числом для форматирования
 * @param decimalPlaces - количество знаков после запятой (по умолчанию автоматически)
 * @returns отформатированная строка с разделителями тысяч
 */
export function formatNumber(value: number | string, decimalPlaces?: number): string {
  // Преобразуем в число
  const num = typeof value === 'string' ? parseFloat(value) : value;
  
  // Проверяем, что это корректное число
  if (isNaN(num)) {
    return String(value);
  }

  // Определяем количество знаков после запятой
  let formattedNum: string;
  if (decimalPlaces !== undefined) {
    formattedNum = num.toFixed(decimalPlaces);
  } else {
    formattedNum = String(num);
  }

  // Разделяем число на целую и дробную части
  const [integerPart, decimalPart] = formattedNum.split('.');
  
  // Добавляем неразрывные пробелы каждые 3 цифры справа налево
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
  
  // Возвращаем результат с дробной частью, если она есть
  return decimalPart ? `${formattedInteger}.${decimalPart}` : formattedInteger;
}

/**
 * Форматирует число для валютного отображения
 * @param value - число для форматирования
 * @param currency - символ валюты (по умолчанию '₽')
 * @param decimalPlaces - количество знаков после запятой (по умолчанию 2)
 * @returns отформатированная строка с валютой
 */
export function formatCurrency(value: number | string, currency: string = '₽', decimalPlaces: number = 2): string {
  const formattedValue = formatNumber(value, decimalPlaces);
  return `${formattedValue}\u00A0${currency}`;
}

/**
 * Форматирует число для отображения USDT
 * @param value - число для форматирования
 * @param decimalPlaces - количество знаков после запятой (по умолчанию автоматически)
 * @returns отформатированная строка с USDT
 */
export function formatUSDT(value: number | string, decimalPlaces?: number): string {
  const formattedValue = formatNumber(value, decimalPlaces);
  return `${formattedValue}\u00A0USDT`;
}
