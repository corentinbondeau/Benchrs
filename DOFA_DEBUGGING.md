# Guide de débogage - Import DOFA

## Console Logs à vérifier

Quand l'API DOFA ne répond pas ou retourne une erreur, voici les logs à vérifier dans la console du navigateur:

### 1. Recherche par nom de club
```
[Club Search Error] - Le serveur DOFA a retourné une erreur
[Search Exception] - Exception lors de la requête (réseau, timeout, etc.)
```

### 2. Recherche par numéro FFF
```
[API Error 400] - Numéro FFF invalide
[API Error 404] - Club non trouvé
[API Error 502/503] - Service DOFA indisponible
[Club Search Exception] - Erreur de connexion
```

### 3. Recherche des équipes d'un club
```
[Team Search Error] - Erreur API lors de la récupération des équipes
[Team Search Exception] - Exception lors de la requête
[Invalid Teams] - Les données retournées ne correspondent pas au format attendu
```

## Format de réponse attendu

L'API doit retourner un objet avec la structure suivante:

```json
{
  "equipes": [
    {
      "eqNo": "525816A",
      "libelle": "AS Monaco (Ligue 1)"
    }
  ],
  "matches": [...],     // optionnel
  "standings": [...]    // optionnel
}
```

### Formats alternatifs acceptés:
- `data.equipes[]` ✓
- `data.data[]` ✓
- `data[]` (tableau direct) ✓

## Checklist de test

### ✓ Avant le test
- [ ] Vérifier que la console du navigateur est ouverte (F12)
- [ ] Vérifier que les logs de la route API apparaissent dans la console
- [ ] Vérifier la connexion Internet

### ✓ Pendant le test
- [ ] Cliquer sur "Import auto FFF"
- [ ] Taper dans le champ de recherche par nom (ex: "Monaco")
- [ ] Vérifier qu'une liste de suggestions apparaît
- [ ] Cliquer sur une suggestion
- [ ] Vérifier que les équipes s'affichent
- [ ] Sélectionner une équipe
- [ ] Cliquer sur "Importer"
- [ ] Vérifier que le championnat est créé

### ✓ Messages d'erreur
- [ ] **Recherche vide**: "Entrez un numéro FFF valide (6 chiffres)"
- [ ] **Numéro invalide**: "Numéro FFF invalide. Entrez 1 à 6 chiffres"
- [ ] **API 404**: "Club non trouvé avec ce numéro FFF"
- [ ] **API 502/503**: "Service FFF indisponible. Réessayez plus tard"
- [ ] **Pas d'équipes**: "Aucune équipe trouvée pour ce numéro FFF"

## Problèmes courants et solutions

### Problème: "Format de réponse non reconnu"
**Cause**: L'API retourne un format inattendu
**Solution**: 
1. Vérifier la structure de `data` dans la console
2. Ajouter la nouvelle structure dans le code (voir `handleSearchClub()`)

### Problème: "Aucune équipe trouvée"
**Cause**: 
- Le club n'existe pas
- L'API retourne une réponse vide
**Solution**: 
1. Vérifier que le numéro FFF est correct (https://www.fff.fr/)
2. Vérifier que l'API retourne bien des données

### Problème: Pas de suggestions lors de la recherche par nom
**Cause**:
- API down
- Requête ne part pas (< 2 caractères)
- Erreur réseau
**Solution**:
1. Vérifier que vous avez tapé au moins 2 caractères
2. Vérifier la connexion Internet
3. Vérifier que l'API DOFA est disponible

## Endpoints API à tester

```bash
# Tester directement depuis le navigateur/curl:
POST /api/championships/dofa
Content-Type: application/json

{
  "fffNumber": "525816",
  "type": "all"
}

# OU

{
  "clubName": "Monaco",
  "type": "all"
}
```

## Logs à activer pour le debug profond

Dans `/api/championships/dofa/route.ts`, les logs suivants aident au debug:

```
console.error("[API Error 400]", data) - Erreur de validation
console.error("[API Error 404]", data) - Club non trouvé
console.error("[Search Response]", data) - Réponse API avec format inattendu
console.error("[Club Search Error]", error) - Erreur lors de la recherche
```

## État de l'API DOFA

Vérifier l'état de l'API FFF DOFA:
- URL: `https://api-dofa.prd-aws.fff.fr/`
- Statut: À vérifier en cas d'erreur 502/503
- Documentation: https://www.fff.fr/

## Données de test disponibles (mode mock)

Si l'API est down, des données de test sont disponibles:
- Club: "525816" ou "monaco"
- Club: "psg"
- Voir `src/lib/dofa-mock-data.ts`
