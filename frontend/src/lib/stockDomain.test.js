import { catalogSearchMatches, normalizeStockText, recommendedOrderQuantity, stockQuantity, visibleStockValue } from "./stockDomain";

const majirel = { brand: "Lâ€™OrÃ©al Professionnel", normalizedCategory: "Coloration permanente", range: "Majirel", productName: "Majirel", shadeCode: "3", normalizedShadeCode: "3/0", shadeName: "ChÃ¢tain foncÃ©", format: "60 ml" };

test("recherche tolÃ©rante par marque, gamme, nuance et accents", () => {
  expect(catalogSearchMatches(majirel, "loreal")).toBe(true);
  expect(catalogSearchMatches(majirel, "majirel")).toBe(true);
  expect(catalogSearchMatches(majirel, "3/0")).toBe(true);
  expect(catalogSearchMatches(majirel, "chatain fonce")).toBe(true);
  expect(catalogSearchMatches(majirel, "wella")).toBe(false);
  expect(normalizeStockText("Lâ€™OrÃ©al")).toContain("lâ€™oreal");
});

test("fractions et recommandations de commande", () => {
  expect(stockQuantity(1 - 0.5)).toBe(0.5);
  expect(stockQuantity(1 - 0.25)).toBe(0.75);
  expect(recommendedOrderQuantity(0, 1)).toBe(1);
  expect(recommendedOrderQuantity(-1, 1)).toBe(2);
  expect(recommendedOrderQuantity(0.5, 1)).toBe(0.5);
});

test("valeur du stock filtrÃ© et tarif nul", () => {
  expect(visibleStockValue([{ quantity: 2, unit_price: 10 }, { quantity: 0.5, unit_price: 8 }, { quantity: 4, unit_price: null }])).toBe(24);
  expect(visibleStockValue([{ quantity: 2, unit_price: 0 }])).toBe(0);
});

