import express from 'express';

import {
  handleVerifyContactgegeven,
  handleCreateContactgegeven,
  handleDeleteContactgegeven,
  handleSetZaakKanaalVoorkeur,
  handleDeleteZaakKanaalVoorkeur,
} from './klantcontact-route-handlers.ts';
import { featureToggle, routes } from './klantcontact-service-config.ts';
import { createBFFRouter } from '../../routing/route-helpers.ts';

const routerProtected = createBFFRouter({ id: 'contact-router-protected' });

routerProtected.use(routes.BASE, express.urlencoded({ extended: true }));
routerProtected.post(routes.CONTACTGEGEVEN_VERIFY, handleVerifyContactgegeven);
routerProtected.post(routes.CONTACTGEGEVEN_CREATE, handleCreateContactgegeven);
routerProtected.post(routes.CONTACTGEGEVEN_DELETE, handleDeleteContactgegeven);

const routerZaakvoorkeur = createBFFRouter({
  id: 'contact-zaakvoorkeur-router-protected',
  isEnabled: featureToggle.zaakvoorkeuren,
});

routerZaakvoorkeur.post(routes.ZAAKVOORKEUR_SET, handleSetZaakKanaalVoorkeur);
routerZaakvoorkeur.post(
  routes.ZAAKVOORKEUR_DELETE,
  handleDeleteZaakKanaalVoorkeur
);

routerProtected.use(routerZaakvoorkeur);

export const klantcontactRouter = {
  protected: routerProtected,
};
