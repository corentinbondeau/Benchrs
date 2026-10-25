# Politique de Sécurité - Benchrs

## Signalement de vulnérabilités
Si vous découvrez une vulnérabilité de sécurité, merci de nous la signaler de manière responsable à :
- **Email** : security@benchrs.fr
- **Fichier** : [.well-known/security.txt](/.well-known/security.txt)

Nous nous engageons à :
- Accuser réception dans les 48h
- Traiter le rapport de manière confidentielle
- Ne pas engager de poursuites contre les chercheurs agissant de bonne foi

## Mesures de sécurité
- Authentification via Supabase Auth (PKCE)
- Row Level Security (RLS) sur toutes les tables sensibles
- Clés API publishable/secret (legacy désactivées)
- Buckets de stockage privés avec URLs signées
- Headers de sécurité (HSTS, CSP, COOP/CORP, X-Frame-Options)
- Rate-limiting sur les routes sensibles
- Journalisation RGPD et audit
- Conformité RGPD (export/suppression/consentements)

## Périmètre
Le signalement doit porter sur l'application https://benchrs.fr
