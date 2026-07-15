export const normalizeStockText = (value) => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("fr-FR");

export const stockQuantity = (value) => Math.round((Number(value) || 0) * 10000) / 10000;

export const catalogSearchMatches = (product, search) => {
  const term = normalizeStockText(search);
  if (!term) return true;
  return normalizeStockText([
    product.brand, product.normalizedCategory, product.range, product.productName,
    product.shadeCode, product.normalizedShadeCode, product.shadeName,
    product.format, product.ean,
  ].join(" ")).includes(term);
};

export const recommendedOrderQuantity = (quantity, targetStock = 1) => Math.max(0, stockQuantity(targetStock - quantity));

export const visibleStockValue = (items) => items.reduce((sum, item) => (
  item.unit_price === null || item.unit_price === undefined
    ? sum
    : sum + stockQuantity(item.quantity) * Number(item.unit_price)
), 0);

