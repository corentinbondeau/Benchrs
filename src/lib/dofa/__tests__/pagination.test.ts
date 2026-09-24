import { describe, expect, it } from "vitest";
import { extractDofaPagination } from "../pagination";

describe("extractDofaPagination", () => {
  it("retourne des métadonnées vides pour une entrée non-objet", () => {
    expect(extractDofaPagination(null)).toEqual({
      totalItems: null,
      pageSize: 0,
      currentPage: null,
      lastPage: null,
      nextUrl: null,
    });
    expect(extractDofaPagination("texte")).toEqual(extractDofaPagination(null));
    expect(extractDofaPagination([])).toEqual(extractDofaPagination(null));
  });

  it("détecte une page suivante (Api Platform v3, clés hydra:)", () => {
    const page = extractDofaPagination({
      "hydra:member": Array.from({ length: 30 }, () => ({ ma_no: 1 })),
      "hydra:totalItems": 132,
      "hydra:view": {
        "@id": "/api/compets/457587/phases/1/poules/4/matchs?page=1&itemsPerPage=30",
        "@type": "hydra:PartialCollectionView",
        "hydra:first": "/api/compets/457587/phases/1/poules/4/matchs?page=1&itemsPerPage=30",
        "hydra:last": "/api/compets/457587/phases/1/poules/4/matchs?page=5&itemsPerPage=30",
        "hydra:next": "/api/compets/457587/phases/1/poules/4/matchs?page=2&itemsPerPage=30",
        "hydra:previous": false,
      },
    });

    expect(page.totalItems).toBe(132);
    expect(page.pageSize).toBe(30);
    expect(page.currentPage).toBe(1);
    expect(page.lastPage).toBe(5);
    expect(page.nextUrl).toBe(
      "https://api-dofa.fff.fr/api/compets/457587/phases/1/poules/4/matchs?page=2&itemsPerPage=30"
    );
  });

  it("gère aussi les clés sans préfixe hydra: (Api Platform v2)", () => {
    const page = extractDofaPagination({
      "hydra:member": [{ ma_no: 1 }],
      "hydra:totalItems": 2,
      "hydra:view": {
        "@id": "/api/compets/c/phases/1/poules/2/matchs?page=1",
        "first": "/api/compets/c/phases/1/poules/2/matchs?page=1",
        "last": "/api/compets/c/phases/1/poules/2/matchs?page=2",
        "next": "/api/compets/c/phases/1/poules/2/matchs?page=2",
        "previous": false,
      },
    });

    expect(page.totalItems).toBe(2);
    expect(page.pageSize).toBe(1);
    expect(page.currentPage).toBe(1);
    expect(page.lastPage).toBe(2);
    expect(page.nextUrl).toBe("https://api-dofa.fff.fr/api/compets/c/phases/1/poules/2/matchs?page=2");
  });

  it("absolutise une URL next déjà absolue telle quelle", () => {
    const page = extractDofaPagination({
      "hydra:member": [{ ma_no: 1 }],
      "hydra:view": {
        "@id": "https://api-dofa.fff.fr/api/compets/c/phases/1/poules/2/matchs?page=1",
        "hydra:last": false,
        "hydra:next": "https://api-dofa.fff.fr/api/compets/c/phases/1/poules/2/matchs?page=2",
      },
    });

    expect(page.nextUrl).toBe("https://api-dofa.fff.fr/api/compets/c/phases/1/poules/2/matchs?page=2");
  });

  it("renvoie nextUrl null quand le payload est complet ou sans enveloppe", () => {
    // Page unique (total <= page courante), aucune vue.
    const single = extractDofaPagination({
      "hydra:member": [{ ma_no: 1 }, { ma_no: 2 }],
      "hydra:totalItems": 2,
      "hydra:view": {
        "@id": "/api/compets/c/phases/1/poules/2/matchs?page=1",
        "hydra:last": "/api/compets/c/phases/1/poules/2/matchs?page=1",
      },
    });
    expect(single.nextUrl).toBeNull();
    expect(single.lastPage).toBe(1);

    // Tableau nu sans métadonnées.
    const bare = extractDofaPagination([{ ma_no: 1 }, { ma_no: 2 }]);
    expect(bare.totalItems).toBeNull();
    expect(bare.pageSize).toBe(2);
    expect(bare.nextUrl).toBeNull();
  });

  it("ignore un page invalide dans hydra:view.@id (currentPage null)", () => {
    const page = extractDofaPagination({
      "hydra:member": [{ ma_no: 1 }],
      "hydra:view": {
        "@id": "https://example.com/matchs?page=abc",
        "hydra:last": "https://example.com/matchs?sans=page",
        "hydra:next": "/api/matchs?page=2",
      },
    });

    expect(page.currentPage).toBeNull();
    expect(page.lastPage).toBeNull();
    expect(page.nextUrl).toBe("https://api-dofa.fff.fr/api/matchs?page=2");
  });
});