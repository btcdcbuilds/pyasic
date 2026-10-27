"""Blender add-on: browse a SiteCapture project's 3D captures and import them.

Install: zip the ``sitecapture_blender`` folder, then Blender > Edit >
Preferences > Add-ons > Install from Disk. Set the server URL in the add-on
preferences. The panel is in the 3D Viewport sidebar (N) > SiteCapture.

Each capture is imported into its own collection named by date, so several
dates can be toggled on/off to compare progress.
"""

import json
import tempfile
import urllib.request
from pathlib import Path

import bpy

bl_info = {
    "name": "SiteCapture",
    "author": "SiteCapture",
    "version": (0, 1, 0),
    "blender": (4, 1, 0),
    "location": "View3D > Sidebar > SiteCapture",
    "description": "Import 3D models of site captures, latest or historical",
    "category": "Import-Export",
}

_versions_cache: list = []


def _prefs(context):
    return context.preferences.addons[__name__].preferences


def _get(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=60) as resp:
        return resp.read()


class SITECAPTURE_Preferences(bpy.types.AddonPreferences):
    bl_idname = __name__
    server_url: bpy.props.StringProperty(
        name="Server URL", default="http://localhost:8000"
    )

    def draw(self, context):
        self.layout.prop(self, "server_url")


def _version_items(self, context):
    if not _versions_cache:
        return [("", "No models loaded", "")]
    items = [
        (str(v["capture_id"]), v["captured_at"][:10], v["format"])
        for v in _versions_cache
    ]
    return list(reversed(items))  # newest first


class SITECAPTURE_Props(bpy.types.PropertyGroup):
    project_id: bpy.props.IntProperty(name="Project ID", default=1, min=1)
    version: bpy.props.EnumProperty(name="Capture", items=_version_items)


class SITECAPTURE_OT_refresh(bpy.types.Operator):
    bl_idname = "sitecapture.refresh"
    bl_label = "Load captures"

    def execute(self, context):
        props = context.scene.sitecapture
        url = f"{_prefs(context).server_url.rstrip('/')}/api/projects/{props.project_id}/models"
        try:
            _versions_cache[:] = json.loads(_get(url))
        except Exception as exc:  # noqa: BLE001
            self.report({"ERROR"}, f"Could not load models: {exc}")
            return {"CANCELLED"}
        self.report({"INFO"}, f"{len(_versions_cache)} capture models")
        return {"FINISHED"}


class SITECAPTURE_OT_import(bpy.types.Operator):
    bl_idname = "sitecapture.import_capture"
    bl_label = "Import capture"

    def execute(self, context):
        props = context.scene.sitecapture
        entry = next(
            (v for v in _versions_cache if str(v["capture_id"]) == props.version), None
        )
        if entry is None:
            self.report({"ERROR"}, "Load captures and pick one first")
            return {"CANCELLED"}
        base = _prefs(context).server_url.rstrip("/")
        path = (
            Path(tempfile.gettempdir())
            / f"sitecapture_{entry['capture_id']}.{entry['format']}"
        )
        try:
            path.write_bytes(_get(base + entry["url"]))
        except Exception as exc:  # noqa: BLE001
            self.report({"ERROR"}, f"Download failed: {exc}")
            return {"CANCELLED"}

        name = f"Capture {entry['captured_at'][:10]}"
        collection = bpy.data.collections.new(name)
        context.scene.collection.children.link(collection)
        layer = context.view_layer.layer_collection.children[collection.name]
        context.view_layer.active_layer_collection = layer

        fmt = entry["format"].lower()
        if fmt == "ply":
            bpy.ops.wm.ply_import(filepath=str(path))
        elif fmt in ("glb", "gltf"):
            bpy.ops.import_scene.gltf(filepath=str(path))
        elif fmt == "obj":
            bpy.ops.wm.obj_import(filepath=str(path))
        else:
            self.report({"ERROR"}, f"Unsupported model format: {fmt}")
            return {"CANCELLED"}
        self.report({"INFO"}, f"Imported {name}")
        return {"FINISHED"}


class SITECAPTURE_PT_panel(bpy.types.Panel):
    bl_label = "SiteCapture"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "SiteCapture"

    def draw(self, context):
        props = context.scene.sitecapture
        col = self.layout.column()
        col.prop(props, "project_id")
        col.operator("sitecapture.refresh")
        col.prop(props, "version")
        col.operator("sitecapture.import_capture")


CLASSES = (
    SITECAPTURE_Preferences,
    SITECAPTURE_Props,
    SITECAPTURE_OT_refresh,
    SITECAPTURE_OT_import,
    SITECAPTURE_PT_panel,
)


def register():
    for cls in CLASSES:
        bpy.utils.register_class(cls)
    bpy.types.Scene.sitecapture = bpy.props.PointerProperty(type=SITECAPTURE_Props)


def unregister():
    del bpy.types.Scene.sitecapture
    for cls in reversed(CLASSES):
        bpy.utils.unregister_class(cls)
