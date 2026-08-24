/**
 * Test canari — valide que l'environnement Vitest est correctement configuré
 *
 * Ces tests ne testent PAS du code métier.
 * Ils garantissent que la stack de test est opérationnelle.
 */

import { describe, it, expect } from "vitest";

describe("Environnement Vitest", () => {
  it("les opérations arithmétiques fonctionnent", () => {
    expect(1 + 1).toBe(2);
  });

  it("le DOM jsdom est disponible", () => {
    const div = document.createElement("div");
    div.textContent = "Hello Vitest";
    document.body.appendChild(div);

    expect(div).toBeInTheDocument();
    expect(div).toHaveTextContent("Hello Vitest");

    // Nettoyage
    document.body.removeChild(div);
  });

  it("les matchers jest-dom sont disponibles (toBeVisible, toHaveClass…)", () => {
    const button = document.createElement("button");
    button.className = "btn-primary";
    button.textContent = "Click me";
    document.body.appendChild(button);

    expect(button).toBeVisible();
    expect(button).toHaveClass("btn-primary");
    expect(button).toHaveTextContent("Click me");

    document.body.removeChild(button);
  });
});
