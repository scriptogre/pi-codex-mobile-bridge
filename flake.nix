{
  description = "Expose Pi sessions to the Codex mobile app";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }: let
    eachSystem = nixpkgs.lib.genAttrs [ "aarch64-darwin" "x86_64-linux" ];
  in {
    packages = eachSystem (system: let
      pkgs = nixpkgs.legacyPackages.${system};
    in {
      default = pkgs.buildNpmPackage {
        pname = "pi-codex-mobile-bridge";
        version = "0.1.0";
        src = self;
        npmDepsHash = "sha256-1xJxr2k8Nz/E5dbpiwsLREUUNhEmzYweiiJBq5zRgmQ=";
        npmDepsFetcherVersion = 2;
        npmBuildScript = "build";
      };
    });
  };
}
