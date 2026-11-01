import contactgegevenSeed from '../fixtures/profielservice/contactgegevens.json' with { type: 'json' };
import dienstverlenerSeed from '../fixtures/profielservice/dienstverlener.json' with { type: 'json' };
import { MOCK_BASE_PATH } from '../settings.ts';
import type { MockRouteDefinition } from '../types.ts';

// Mock van de profielservice (BFF_PROFIEL_API_BASE_URL = $BFF_MOCK_API_BASE_URL/profielservice).
// Het formaat volgt ContactProfieldienstResponseSource en ContactgegevenSource in
// src/server/services/klantcontact/klantcontact-profieldienst-types.ts.
// De gegevens leven in het geheugen en zijn gedeeld voor alle gebruikers, zolang de mock-server draait.

const BASE = `${MOCK_BASE_PATH}/profielservice`;
const VERIFICATIE_CODE = '123456';

type MockContactgegeven = {
  id: string;
  type: string;
  waarde: string;
  isGeverifieerd: boolean;
  isDefault: boolean;
  referentie: string | null;
  createdAt: string;
  lastUpdated: string;
  scopes: unknown[];
};

type MockInstellingen = {
  partijFout: boolean; // POST /partij geeft een 500
  leegProfiel: boolean; // POST /partij geeft een profiel zonder contactgegevens
  createFout: boolean; // POST /contactgegeven geeft een 500
};

const DEFAULT_INSTELLINGEN: MockInstellingen = {
  partijFout: false,
  leegProfiel: false,
  createFout: false,
};

let instellingen: MockInstellingen = { ...DEFAULT_INSTELLINGEN };
let contactgegevens: MockContactgegeven[] = structuredClone(
  contactgegevenSeed
) as MockContactgegeven[];
let volgendId = 100;

function reset() {
  instellingen = { ...DEFAULT_INSTELLINGEN };
  contactgegevens = structuredClone(contactgegevenSeed) as MockContactgegeven[];
  volgendId = 100;
}

function verifieer(type: string, waarde: unknown): boolean {
  const gevonden = contactgegevens.filter(
    (cg) => cg.type === type && cg.waarde === waarde
  );
  gevonden.forEach((cg) => {
    cg.isGeverifieerd = true;
    cg.lastUpdated = new Date().toISOString();
  });
  return gevonden.length > 0;
}

export const routes: MockRouteDefinition[] = [
  {
    id: 'post-profielservice-partij',
    url: `${BASE}/partij`,
    method: 'POST',
    handler: {
      type: 'middleware',
      middleware: (req, res) => {
        if (instellingen.partijFout) {
          return res.status(500).send({ message: 'Mock: partij mislukt' });
        }

        return res.status(200).send({
          partijId: 'mock-partij-1',
          identificaties: [
            {
              identificatieType: req.body?.identificatieType,
              identificatieNummer: req.body?.identificatieNummer,
            },
          ],
          voorkeuren: [],
          contactgegevens: instellingen.leegProfiel ? [] : contactgegevens,
        });
      },
    },
  },
  {
    id: 'get-profielservice-dienstverlener',
    url: `${BASE}/dienstverlener/:naam`,
    method: 'GET',
    handler: {
      type: 'middleware',
      middleware: (req, res) =>
        res.status(200).send({ ...dienstverlenerSeed, naam: req.params.naam }),
    },
  },
  {
    id: 'post-profielservice-contactgegeven',
    url: `${BASE}/contactgegeven`,
    method: 'POST',
    handler: {
      type: 'middleware',
      middleware: (req, res) => {
        const { type, waarde, isDefault, referentie } = req.body ?? {};

        if (!type || !waarde) {
          return res.status(400).send({ message: 'type en waarde zijn nodig' });
        }

        if (instellingen.createFout) {
          return res.status(500).send({ message: 'Mock: aanmaken mislukt' });
        }

        const nu = new Date().toISOString();
        const nieuw: MockContactgegeven = {
          id: String(volgendId++),
          type,
          waarde,
          isGeverifieerd: false, // Net als de echte service: pas geverifieerd na de code.
          isDefault: isDefault ?? true,
          referentie: referentie ?? null,
          createdAt: nu,
          lastUpdated: nu,
          scopes: [],
        };
        contactgegevens.push(nieuw);

        return res.status(200).send(nieuw);
      },
    },
  },
  {
    id: 'delete-profielservice-contactgegeven',
    url: `${BASE}/contactgegeven/:id`,
    method: 'DELETE',
    handler: {
      type: 'middleware',
      middleware: (req, res) => {
        const aantal = contactgegevens.length;
        contactgegevens = contactgegevens.filter(
          (cg) => cg.id !== req.params.id
        );

        return contactgegevens.length === aantal
          ? res.status(404).send({ message: 'Contactgegeven niet gevonden' })
          : res.status(204).send();
      },
    },
  },
  {
    id: 'post-profielservice-emailverificatie',
    url: `${BASE}/emailverificatie`,
    method: 'POST',
    handler: {
      type: 'middleware',
      middleware: (req, res) => {
        const { email, verificatieCode } = req.body ?? {};

        return verificatieCode === VERIFICATIE_CODE &&
          verifieer('Email', email)
          ? res.status(200).send({})
          : res.status(400).send({ message: 'Onjuiste of verlopen code' });
      },
    },
  },
  {
    // AANNAME: het echte endpoint voor telefoonverificatie is nog niet bekend (open punt 7).
    // Pas pad en payload aan zodra de profielservice-beheerders antwoorden.
    id: 'post-profielservice-telefoonverificatie',
    url: `${BASE}/telefoonverificatie`,
    method: 'POST',
    handler: {
      type: 'middleware',
      middleware: (req, res) => {
        const { telefoonnummer, verificatieCode } = req.body ?? {};

        return verificatieCode === VERIFICATIE_CODE &&
          verifieer('Telefoonnummer', telefoonnummer)
          ? res.status(200).send({})
          : res.status(400).send({ message: 'Onjuiste of verlopen code' });
      },
    },
  },
  {
    // Alleen voor de mock zelf: foutpaden aanzetten, bijvoorbeeld
    // curl -X POST <mock>/profielservice/mock/instellingen -H 'Content-Type: application/json' -d '{"partijFout":true}'
    id: 'post-profielservice-mock-instellingen',
    url: `${BASE}/mock/instellingen`,
    method: 'POST',
    handler: {
      type: 'middleware',
      middleware: (req, res) => {
        instellingen = {
          ...instellingen,
          ...Object.fromEntries(
            Object.entries(req.body ?? {}).filter(
              ([sleutel, waarde]) =>
                sleutel in DEFAULT_INSTELLINGEN && typeof waarde === 'boolean'
            )
          ),
        };

        return res.status(200).send(instellingen);
      },
    },
  },
  {
    id: 'post-profielservice-mock-reset',
    url: `${BASE}/mock/reset`,
    method: 'POST',
    handler: {
      type: 'middleware',
      middleware: (_req, res) => {
        reset();

        return res.status(200).send(instellingen);
      },
    },
  },
];
