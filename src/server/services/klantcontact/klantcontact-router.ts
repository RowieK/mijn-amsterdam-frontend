import express from 'express';

import {
  handleVerifyContactgegeven,
  handleCreateContactgegeven,
  handleDeleteContactgegeven,
  handleSetZaakKanaalVoorkeur,
  handleDeleteZaakKanaalVoorkeur,
} from './klantcontact-route-handlers.ts';
import { routes } from './klantcontact-service-config.ts';
import { createBFFRouter } from '../../routing/route-helpers.ts';

const routerProtected = createBFFRouter({ id: 'contact-router-protected' });

routerProtected.use(routes.BASE, express.urlencoded({ extended: true }));
routerProtected.post(routes.CONTACTGEGEVEN_VERIFY, handleVerifyContactgegeven);
routerProtected.post(routes.CONTACTGEGEVEN_CREATE, handleCreateContactgegeven);
routerProtected.post(routes.CONTACTGEGEVEN_DELETE, handleDeleteContactgegeven);
routerProtected.post(routes.ZAAKVOORKEUR_SET, handleSetZaakKanaalVoorkeur);
routerProtected.post(
  routes.ZAAKVOORKEUR_DELETE,
  handleDeleteZaakKanaalVoorkeur
);

export const klantcontactRouter = {
  protected: routerProtected,
};
