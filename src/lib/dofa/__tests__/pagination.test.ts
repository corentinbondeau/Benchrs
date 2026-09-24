import { describe, expect, it } from "vitest";
import { DofaFetchError, extractDofaPagination, fetchAllDofaMatchPages } from "../pagination";

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

describe("fetchAllDofaMatchPages", () => {
  const page = (n: number, total: number, size = 30) => ({
    "hydra:member": Array.from({ length: size }, (_, i) => ({ ma_no: (n - 1) * size + i + 1 })),
    "hydra:totalItems": total,
    "hydra:view": {
      "@id": `https://api-dofa.fff.fr/api/compets/c/phases/1/poules/2/matchs?page=${n}`,
      "hydra:last": `https://api-dofa.fff.fr/api/compets/c/phases/1/poules/2/matchs?page=${Math.ceil(total / size)}`,
      ...(n * size < total
        ? { "hydra:next": `https://api-dofa.fff.fr/api/compets/c/phases/1/poules/2/matchs?page=${n + 1}` }
        : {}),
    },
  });

  it("déroule toutes les pages et renvoie les matchs combinés + le total", async () => {
    const calls: string[] = [];
    const fetcher = (url: string) => {
      calls.push(url);
      const n = Number(new URL(url).searchParams.get("page"));
      return Promise.resolve(new Response(JSON.stringify(page(n, 132)), { status: 200 }));
    };

    const result = await fetchAllDofaMatchPages(page(1, 132), { fetcher });

    expect(result.pages).toBe(5);
    expect(result.total).toBe(132);
    expect(result.matches).toHaveLength(132);
    // La page 1 vient du collage, les pages 2..5 sont téléchargées.
    expect(calls).toHaveLength(4);
    expect(calls.map((u) => new URL(u).searchParams.get("page"))).toEqual(["2", "3", "4", "5"]);
  });

  it("s'arrête à la dernière page (pas de nextUrl) sans appel supplémentaire", async () => {
    const calls: string[] = [];
    const fetcher = (url: string) => {
      calls.push(url);
      return Promise.resolve(new Response(JSON.stringify(page(1, 22)), { status: 200 }));
    };

    const result = await fetchAllDofaMatchPages(page(1, 22), { fetcher });

    expect(result.pages).toBe(1);
    expect(result.matches).toHaveLength(22);
    expect(calls).toHaveLength(0);
  });

  it("déduplique les matchs dont le ma_no se chevauche entre pages", async () => {
    const fetcher = () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            "hydra:member": Array.from({ length: 3 }, (_, i) => ({ ma_no: i + 1 })),
            "hydra:totalItems": 3,
            "hydra:view": {
              "@id": "https://api-dofa.fff.fr/api/matchs?page=2",
              "hydra:last": "https://api-dofa.fff.fr/api/matchs?page=2",
            },
          }),
          { status: 200 }
        )
      );

    const overlapping = {
      "hydra:member": [{ ma_no: 1 }, { ma_no: 2 }, { ma_no: 3 }],
      "hydra:totalItems": 3,
      "hydra:view": {
        "@id": "https://api-dofa.fff.fr/api/matchs?page=1",
        "hydra:next": "https://api-dofa.fff.fr/api/matchs?page=2",
      },
    };

    const result = await fetchAllDofaMatchPages(overlapping, { fetcher });
    expect(result.matches).toHaveLength(3);
    expect(result.matches.map((m) => (m as { ma_no: number }).ma_no)).toEqual([1, 2, 3]);
  });

  it("lève DofaFetchError quand une page suivante répond non-OK", async () => {
    const fetcher = () => Promise.resolve(new Response("interdit", { status: 403 }));
    await expect(fetchAllDofaMatchPages(page(1, 132), { fetcher })).rejects.toThrow(DofaFetchError);
  });

  it("respecte la garde maxPages en cas de pagination qui ne se termine pas", async () => {
    // Chaque page renvoie un nextUrl menant à elle-même (boucle détectée par
    // la garde anti-boucle = arrêt propre, sans erreur).
    const inifinite = {
      "hydra:member": [{ ma_no: 1 }],
      "hydra:totalItems": 5000,
      "hydra:view": {
        "@id": "https://api-dofa.fff.fr/api/matchs?page=1",
        "hydra:next": "https://api-dofa.fff.fr/api/matchs?page=2",
      },
    };
    let calls = 0;
    const fetcher = () => {
      calls += 1;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            "hydra:member": [{ ma_no: calls + 1 }],
            "hydra:totalItems": 5000,
            "hydra:view": {
              "@id": `https://api-dofa.fff.fr/api/matchs?page=${calls + 1}`,
              "hydra:next": `https://api-dofa.fff.fr/api/matchs?page=${calls + 2}`,
            },
          }),
          { status: 200 }
        )
      );
    };

    const result = await fetchAllDofaMatchPages(inifinite, { fetcher, maxPages: 3 });
    expect(result.pages).toBe(3);
    expect(result.matches).toHaveLength(3);
  });
});