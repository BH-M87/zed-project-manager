use schemars::JsonSchema;
use serde::Deserialize;
use std::env;
use zed::settings::ContextServerSettings;
use zed_extension_api::{
    self as zed, serde_json, Command, ContextServerConfiguration, ContextServerId, Project, Result,
};

const NPM_PACKAGE_NAME: &str = "zed-project-manager";
const NPM_PACKAGE_VERSION: &str = "0.1.0";
const DEFAULT_SETTINGS: &str = r#"{
  "binary_path": "",
  "config_path": ""
}"#;

struct ProjectManagerExtension;

#[derive(Debug, Deserialize, JsonSchema)]
struct ProjectManagerSettings {
    /// Optional zpm executable override. Leave empty to use the extension-managed npm package.
    #[serde(default)]
    #[schemars(default)]
    binary_path: String,

    /// Optional path to a zpm configuration file.
    #[serde(default)]
    #[schemars(default)]
    config_path: String,
}

impl Default for ProjectManagerSettings {
    fn default() -> Self {
        Self {
            binary_path: String::new(),
            config_path: String::new(),
        }
    }
}

fn settings_for_project(
    context_server_id: &ContextServerId,
    project: &Project,
) -> Result<ProjectManagerSettings> {
    let settings = ContextServerSettings::for_project(context_server_id.as_ref(), project)?;
    match settings.settings {
        Some(value) => serde_json::from_value(value)
            .map_err(|error| format!("invalid Project Manager settings: {error}")),
        None => Ok(ProjectManagerSettings::default()),
    }
}

impl zed::Extension for ProjectManagerExtension {
    fn new() -> Self {
        Self
    }

    fn context_server_command(
        &mut self,
        context_server_id: &ContextServerId,
        project: &Project,
    ) -> Result<Command> {
        let settings = settings_for_project(context_server_id, project)?;
        let (command, args) = if settings.binary_path.trim().is_empty() {
            let installed_version = zed::npm_package_installed_version(NPM_PACKAGE_NAME)?;
            if installed_version.as_deref() != Some(NPM_PACKAGE_VERSION) {
                zed::npm_install_package(NPM_PACKAGE_NAME, NPM_PACKAGE_VERSION)?;
            }

            let server_path = env::current_dir()
                .map_err(|error| format!("failed to locate the extension directory: {error}"))?
                .join("node_modules")
                .join(NPM_PACKAGE_NAME)
                .join("dist")
                .join("cli.js")
                .to_string_lossy()
                .to_string();
            (
                zed::node_binary_path()?,
                vec![server_path, "mcp".to_string()],
            )
        } else {
            (settings.binary_path, vec!["mcp".to_string()])
        };
        let env = if settings.config_path.trim().is_empty() {
            Vec::new()
        } else {
            vec![("ZPM_CONFIG".to_string(), settings.config_path)]
        };

        Ok(Command { command, args, env })
    }

    fn context_server_configuration(
        &mut self,
        _context_server_id: &ContextServerId,
        _project: &Project,
    ) -> Result<Option<ContextServerConfiguration>> {
        let settings_schema = serde_json::to_string(&schemars::schema_for!(ProjectManagerSettings))
            .map_err(|error| error.to_string())?;

        Ok(Some(ContextServerConfiguration {
            installation_instructions: include_str!("installation_instructions.md").to_string(),
            settings_schema,
            default_settings: DEFAULT_SETTINGS.to_string(),
        }))
    }
}

zed::register_extension!(ProjectManagerExtension);
