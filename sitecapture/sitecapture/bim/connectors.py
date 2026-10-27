"""Autodesk Construction Cloud (ACC/Revit) and Procore connectors.

NOT IMPLEMENTED YET. Both need an app registered by you with the vendor
(OAuth client ID/secret and a callback URL), so they can't be built or tested
without those credentials. This module fixes the interface the rest of the
app uses so they can be added without touching other code.

* Autodesk Platform Services (APS): OAuth 3-legged login, Data Management API
  to browse hubs/projects/files, Model Derivative API to get viewable/IFC
  output from Revit models.
* Procore: OAuth login, then push reports/photos to a project.
"""

from __future__ import annotations

from abc import ABC, abstractmethod


class NotConfigured(RuntimeError):
    pass


class BimConnector(ABC):
    name: str

    @abstractmethod
    def authorize_url(self, redirect_uri: str) -> str:
        """Where to send the user to grant access."""

    @abstractmethod
    def list_models(self, project_ref: str) -> list[dict]:
        """Models/files available in the remote project."""

    @abstractmethod
    def download_ifc(self, model_ref: str, target_path: str) -> str:
        """Fetch a model as IFC so it can go through ``bim.ifc``."""


class _Pending(BimConnector):
    def _fail(self):
        raise NotConfigured(
            f"{self.name} integration is not implemented yet; upload an IFC export instead"
        )

    def authorize_url(self, redirect_uri: str) -> str:
        self._fail()

    def list_models(self, project_ref: str) -> list[dict]:
        self._fail()

    def download_ifc(self, model_ref: str, target_path: str) -> str:
        self._fail()


class AutodeskConnector(_Pending):
    name = "Autodesk Construction Cloud"


class ProcoreConnector(_Pending):
    name = "Procore"


CONNECTORS = {"acc": AutodeskConnector, "procore": ProcoreConnector}
