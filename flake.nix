{
  description = "neoropilot flake";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };
  outputs = {
    self,
    nixpkgs,
    flake-utils,
  }:
    flake-utils.lib.eachDefaultSystem
    (system: let
      overlays = [
        (self: super: {
          nodejs = super.nodejs_22;
        })
      ];
      pkgs = import nixpkgs {
        inherit system overlays;
      };
      nativeBuildInputs = with pkgs; [
        git
        alejandra
        postgresql
        docker-compose
        pnpm
        nodejs
        typescript
        yarn-berry_4
        nodePackages.vercel
      ];
      devEnvVars = rec {};
    in
      with pkgs; {
        devShells.default = mkShell (devEnvVars
          // {
            inherit nativeBuildInputs;
          });

        formatter = alejandra;
      });
}
